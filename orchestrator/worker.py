"""
orchestrator/worker.py — quem realmente executa o que o painel pediu.

POR QUE ISTO EXISTE
A rota /api/run fazia `spawn("python", args)`: o painel EXECUTAVA o pipeline no
próprio processo do servidor. Isso só funciona na máquina do dono. Na Vercel não
há python, não há o repositório e não há disco — os botões "Rodar" respondiam
bonitinho e não faziam nada.

Agora o painel só PEDE (grava uma linha em `run_queue`) e este worker executa,
rodando onde o Python existe: o ciclo diário no GitHub Actions, ou a máquina do
dono na mão.

AS DUAS REGRAS QUE MANDAM AQUI
  1. NÃO CONFIE NA WEB. A allowlist e a sanitização de parâmetros são repetidas
     em Python (`build_args`). A rota já valida, mas quem monta a linha de
     comando é este arquivo — a validação tem que estar do lado de quem executa,
     não só do lado de quem pede. Se a linha da fila vier com tarefa
     desconhecida ou parâmetro inválido, ela é marcada `falhou` sem executar
     nada.
  2. FALHE PRA PENDENTE, NUNCA PRA DUPLICADO. Toda transição de estado é um
     PATCH condicionado ao estado anterior (`status=eq.pendente`), e o banco diz
     quantas linhas mudaram. Quem consegue mudar a linha é dono da tarefa; quem
     não consegue (outro worker chegou antes, banco fora do ar) NÃO executa.
     Gastar API duas vezes é caro e irreversível; deixar na fila só adianta o
     relógio da próxima passada.

Uso:
    python -m orchestrator.worker            # drena a fila e sai
    python -m orchestrator.worker --once     # processa UMA tarefa e sai

Deliberadamente NÃO existe modo daemon com sleep: quem agenda é o cron do
GitHub Actions (ou o Agendador do Windows). Processo que dorme para sozinho e
ninguém percebe — foi assim que o produto ficou 45 dias parado em julho.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "jobs"
load_dotenv(ROOT / ".env")

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
_TIMEOUT = 10          # segundos por chamada ao PostgREST
_TIMEOUT_TAREFA = 1800  # 30 min por tarefa, o mesmo teto do daily.py

# Tarefa presa em `executando` por mais tempo que isto volta pra `pendente`.
# Ver `recupera_travadas` — a escolha do número está explicada lá.
HORAS_ATE_DESTRAVAR = 2

# Quantas tarefas uma drenagem processa no máximo. Válvula de segurança: se
# alguém (ou um bug de front) enfileirar mil Fase A, o ciclo diário não vira uma
# fatura de API de mil dossiês numa noite. O resto fica na fila pro dia seguinte.
LIMITE_POR_DRENAGEM = 20


# ══════════════════════════════════════════════════════════════════════════
# Allowlist — o espelho em Python de web/app/api/run/route.ts
# ══════════════════════════════════════════════════════════════════════════

def _max(valor) -> int:
    """Mesma conta do TS: `Math.min(Math.max(Number(max) || 2, 1), 10)`.

    Valor ausente, não-numérico ou zero cai em 2 (o padrão do painel), e o
    resultado é grampeado em 1..10 — este número vira "quantas pautas novas",
    ou seja, é o multiplicador direto do gasto de API.
    """
    try:
        n = int(float(valor))
    except (TypeError, ValueError):
        n = 0
    if n == 0:
        n = 2
    return min(max(n, 1), 10)


def _slug(valor) -> str:
    """Slug de dossiê: `^[a-z0-9][a-z0-9-]{0,79}$` ou nada. Vira argumento de
    linha de comando, então aqui não existe "quase válido" — ou casa a regex, ou
    é ''.

    O "não pode COMEÇAR com hífen" não estava na versão original e foi
    acrescentado dos dois lados (aqui e no route.ts). Motivo: `--dry-run` e
    `--no-art` casam com `^[a-z0-9-]+$` perfeitamente, e são flags DE VERDADE do
    build_carousel e do build_platforms. Não é injeção de shell — os argumentos
    vão como lista, sem shell — mas é um parâmetro do painel virando flag do
    script, que é exatamente o tipo de coisa que a allowlist existe pra impedir.
    """
    s = valor if isinstance(valor, str) else ""
    if not 1 <= len(s) <= 80 or s.startswith("-"):
        return ""
    return s if all(c.isdigit() or ("a" <= c <= "z") or c == "-" for c in s) else ""


def _tema(valor) -> str:
    """Tema livre do usuário, na mesma ordem do TS: corta em 80 e só então
    filtra. Sobram letras, números, espaço e hífen — equivalente ao
    `/[^\\p{L}\\p{N} -]/gu` de lá, preservando acento (é 'guarda-aberta',
    'raspagem de gancho', escrito em português).

    Os hífens e espaços da BORDA caem também (mesma razão do _slug: valor que
    começa com hífen é lido como flag pelo argparse, e aí `--tema` fica sem
    valor e o comando morre com uma mensagem que não ajuda ninguém).
    """
    s = valor if isinstance(valor, str) else ""
    return "".join(c for c in s[:80] if c.isalpha() or c.isnumeric() or c in " -").strip(" -")


def build_args(task: str, params: dict | None = None) -> list[str] | None:
    """Argumentos do `python -m ...` para uma tarefa da fila, ou None.

    None significa uma de duas coisas, e as duas terminam igual (tarefa marcada
    `falhou` sem executar): tarefa fora da allowlist, ou parâmetro obrigatório
    que não sobreviveu à sanitização.
    """
    p = params if isinstance(params, dict) else {}
    mx = _max(p.get("max"))
    slug = _slug(p.get("slug"))
    tema = _tema(p.get("tema"))
    if task == "fase_a":
        return ["-m", "orchestrator.phase_a", "--max", str(mx)]
    if task == "fase_a_free":
        return ["-m", "orchestrator.phase_a", "--free", "--limit", "25"]
    if task == "carrossel":
        return ["-m", "orchestrator.build_carousel", slug] if slug else None
    if task == "plataformas":
        return ["-m", "orchestrator.build_platforms", slug] if slug else None
    if task == "atletas":
        return ["-m", "orchestrator.enrich_athlete", "--max", str(mx)]
    if task == "produtos":
        return ["-m", "orchestrator.find_products", "--max", str(mx)]
    if task == "produtos_dia":
        return ["-m", "orchestrator.find_products", "--diario"]
    if task == "curso":
        return ["-m", "orchestrator.build_course", "--tema", tema] if tema else None
    if task == "publicar":
        return ["-m", "orchestrator.sync_to_cloud"]
    if task == "tendencias":
        return ["-m", "orchestrator.scout_trends"]
    if task == "planejar":
        return ["-m", "orchestrator.plan_week"]
    if task == "ideias_3d":
        return ["-m", "orchestrator.ideate", "--kind", "3d"]
    if task == "ideias_cursos":
        return ["-m", "orchestrator.ideate", "--kind", "cursos"]
    return None


# ══════════════════════════════════════════════════════════════════════════
# Acesso ao banco — isolado em quatro funções para o teste injetar por monkeypatch
# ══════════════════════════════════════════════════════════════════════════

def _habilitado() -> bool:
    return bool(_URL and _KEY)


def _headers(extra: dict | None = None) -> dict:
    return {"apikey": _KEY, "Authorization": f"Bearer {_KEY}",
            "Content-Type": "application/json", **(extra or {})}


def _db_pendentes(limite: int = 1) -> list[dict]:
    """As `pendente` mais antigas primeiro (FIFO). Levanta em erro de rede."""
    req = urllib.request.Request(
        f"{_URL}/rest/v1/run_queue?status=eq.pendente&order=requested_at.asc"
        f"&limit={int(limite)}&select=id,task,params,requested_by",
        headers=_headers())
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return json.loads(r.read())


def _db_travadas(limite_iso: str) -> list[dict]:
    """`executando` que começaram antes de `limite_iso`. Levanta em erro de rede."""
    q = urllib.parse.quote(limite_iso, safe="")
    req = urllib.request.Request(
        f"{_URL}/rest/v1/run_queue?status=eq.executando&started_at=lt.{q}"
        f"&select=id,task,started_at", headers=_headers())
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return json.loads(r.read())


def _db_patch(linha_id: str, patch: dict, se_status: str | None = None) -> int:
    """Muda UMA linha e devolve quantas mudaram de fato (0 ou 1).

    O `se_status` é o coração da idempotência: o filtro `status=eq.<esperado>`
    vai no WHERE, então dois workers competindo pela mesma linha resultam em um
    com 1 e outro com 0 — sem precisar de lock, transação ou SELECT FOR UPDATE.
    Quem recebe 0 desiste da linha. Levanta em erro de rede (quem chama trata).
    """
    url = f"{_URL}/rest/v1/run_queue?id=eq.{urllib.parse.quote(str(linha_id), safe='')}"
    if se_status:
        url += f"&status=eq.{se_status}"
    req = urllib.request.Request(
        url, method="PATCH", data=json.dumps(patch).encode("utf-8"),
        headers=_headers({"Prefer": "return=representation"}))
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return len(json.loads(r.read()) or [])


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ══════════════════════════════════════════════════════════════════════════
# Máquina de estados
# ══════════════════════════════════════════════════════════════════════════

def recupera_travadas() -> int:
    """Devolve pra `pendente` as tarefas presas em `executando`. Quantas voltaram.

    POR QUE PRECISA EXISTIR: se o processo morrer no meio (runner cortado no
    timeout de 60 min, PC desligado, exceção não tratada), a linha fica
    `executando` PARA SEMPRE. Ninguém executa e ninguém reclama — a tarefa
    simplesmente evapora, e o dono só descobre que o carrossel nunca saiu.

    O PREÇO, que é honesto assumir: uma tarefa que rodou até o fim mas não
    conseguiu gravar o resultado (banco caiu no minuto errado) volta pra fila e
    roda de novo. Por isso as 2h: é ordem de grandeza acima da tarefa mais lenta
    (o teto por tarefa é 30 min), então só uma quebra real chega aqui. O
    contrário — deixar travado pra nunca duplicar — troca um gasto ocasional por
    uma fila que enche em silêncio, que é o defeito que esta fase veio matar.
    """
    if not _habilitado():
        return 0
    limite = _iso(_agora() - timedelta(hours=HORAS_ATE_DESTRAVAR))
    try:
        travadas = _db_travadas(limite)
    except Exception as e:  # noqa: BLE001 — banco fora do ar: não é hora de agir
        print(f"[worker] não consegui checar tarefas travadas: {e}")
        return 0
    voltaram = 0
    for linha in travadas:
        try:
            # O `se_status` garante que a gente não atropele um worker que
            # acabou de terminar a tarefa entre a leitura e este PATCH.
            if _db_patch(linha["id"], {"status": "pendente", "started_at": None,
                                       "run_id": None}, se_status="executando"):
                voltaram += 1
                print(f"[worker] destravei {linha.get('task')} (parada desde {linha.get('started_at')})")
        except Exception as e:  # noqa: BLE001
            print(f"[worker] não consegui destravar {linha.get('id')}: {e}")
    return voltaram


def proxima_tarefa() -> dict | None:
    """Pega a `pendente` mais antiga e a marca `executando`. None quando não há.

    Devolve None também quando o banco está fora do ar ou quando outro worker
    ganhou a corrida — nos três casos a resposta certa é a mesma: não execute.
    """
    if not _habilitado():
        return None
    try:
        candidatas = _db_pendentes(limite=5)
    except Exception as e:  # noqa: BLE001
        print(f"[worker] não consegui ler a fila: {e}")
        return None
    for linha in candidatas:
        run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{str(linha['id'])[:8]}"
        try:
            mudou = _db_patch(linha["id"],
                              {"status": "executando", "started_at": _iso(_agora()),
                               "run_id": run_id, "error": None},
                              se_status="pendente")
        except Exception as e:  # noqa: BLE001 — não deu pra reivindicar: não execute
            print(f"[worker] não consegui reivindicar {linha['id']}: {e}")
            return None
        if mudou:
            return {**linha, "run_id": run_id}
        # 0 linhas = outro worker pegou esta. Tenta a próxima candidata.
    return None


def _roda_comando(args: list[str], log_path: Path) -> tuple[int, str]:
    """Executa `python -m ...` e devolve (código de saída, saída em texto).

    Isolado numa função só pra o teste conseguir substituir sem rede nem
    subprocesso — e pra o log em arquivo continuar existindo na máquina do dono
    (na Vercel ninguém lê `jobs/`, mas no Actions ele vira anexo do run).
    """
    JOBS.mkdir(exist_ok=True)
    r = subprocess.run([sys.executable, *args], cwd=str(ROOT), capture_output=True,
                       text=True, timeout=_TIMEOUT_TAREFA,
                       env={**os.environ, "PYTHONIOENCODING": "utf-8",
                            "PYTHONUNBUFFERED": "1"})
    saida = (r.stdout or "") + (r.stderr or "")
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"$ python {' '.join(args)}\n{saida}\n[[DONE exit={r.returncode}]]\n")
    except Exception:  # noqa: BLE001 — log é conveniência, não requisito
        pass
    return r.returncode, saida


def _finaliza(linha_id: str, status: str, erro: str | None = None) -> bool:
    """Grava o estado final. Tenta 3 vezes antes de desistir.

    A insistência tem motivo: a tarefa JÁ rodou e já custou API. Se este PATCH
    não passar, a linha fica `executando` e daqui a 2h o `recupera_travadas`
    manda executar de novo. Três tentativas cobrem a instabilidade de rede que é
    o caso comum.
    """
    patch: dict = {"status": status, "finished_at": _iso(_agora()), "error": erro}
    for tentativa in range(3):
        try:
            if _db_patch(linha_id, patch, se_status="executando"):
                return True
            return False  # 0 linhas: alguém já finalizou. Insistir não ajuda.
        except Exception as e:  # noqa: BLE001
            if tentativa == 2:
                print(f"[worker] NÃO consegui marcar {linha_id} como {status}: {e} — "
                      f"a linha volta pra fila em {HORAS_ATE_DESTRAVAR}h e pode rodar de novo")
    return False


def processa_uma() -> str | None:
    """Processa a próxima da fila. Devolve o status final, ou None se não havia."""
    linha = proxima_tarefa()
    if not linha:
        return None
    task = str(linha.get("task") or "")
    args = build_args(task, linha.get("params"))
    if not args:
        # Revalidação do lado de quem executa. Chegar aqui significa que a fila
        # tem lixo (rota antiga, escrita direta no banco, tarefa removida da
        # allowlist) — não é pra executar nada, e o painel precisa ver o motivo.
        erro = f"tarefa inválida ou faltam parâmetros: task={task!r} params={linha.get('params')!r}"
        print(f"[worker] {erro}")
        _finaliza(linha["id"], "falhou", erro)
        return "falhou"

    log_path = JOBS / f"run-{linha.get('run_id')}.log"
    print(f"[worker] {task} → python {' '.join(args)}")
    try:
        codigo, saida = _roda_comando(args, log_path)
    except Exception as e:  # noqa: BLE001 — timeout, python sumido, o que for
        _finaliza(linha["id"], "falhou", f"{type(e).__name__}: {e}"[:2000])
        print(f"[worker] {task} FALHOU: {e}")
        return "falhou"

    if codigo == 0:
        _finaliza(linha["id"], "concluido", None)
        print(f"[worker] {task} concluído")
        return "concluido"
    # Guarda o FIM da saída: o traceback e a mensagem de erro moram lá, e é isso
    # que o painel mostra pro dono sem ele precisar caçar log em anexo.
    _finaliza(linha["id"], "falhou", f"exit={codigo}\n{saida[-1800:]}")
    print(f"[worker] {task} FALHOU (exit={codigo})")
    return "falhou"


def drena(limite: int = LIMITE_POR_DRENAGEM) -> dict:
    """Processa até `limite` tarefas e sai. Contadores por status."""
    contas = {"concluido": 0, "falhou": 0}
    if not _habilitado():
        print("[worker] sem SUPABASE_URL/SERVICE_ROLE_KEY — a fila não existe aqui")
        return contas
    recupera_travadas()
    for _ in range(max(1, limite)):
        status = processa_uma()
        if status is None:
            break
        contas[status] = contas.get(status, 0) + 1
    return contas


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser(description="Consome a fila run_queue (o que o painel pediu).")
    ap.add_argument("--once", action="store_true", help="processa uma tarefa e sai")
    ap.add_argument("--limite", type=int, default=LIMITE_POR_DRENAGEM,
                    help=f"teto de tarefas por drenagem (padrão {LIMITE_POR_DRENAGEM})")
    args = ap.parse_args()

    if args.once:
        if not _habilitado():
            print("[worker] sem SUPABASE_URL/SERVICE_ROLE_KEY — a fila não existe aqui")
            return 0
        recupera_travadas()
        status = processa_uma()
        print(f"[worker] fila: {status or 'vazia'}")
        return 1 if status == "falhou" else 0

    contas = drena(args.limite)
    print(f"[worker] fila drenada: concluídas={contas['concluido']} · falharam={contas['falhou']}")
    # Sai com erro quando ALGUMA tarefa da fila falhou: no ciclo diário isso é o
    # que faz o alerta por issue disparar em vez de a falha morrer no log.
    return 1 if contas["falhou"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
