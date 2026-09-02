"""
A regra do worker em uma frase: o painel PEDE, o worker EXECUTA — e nunca duas vezes.

Estes testes não tocam a rede nem abrem subprocesso: o acesso ao banco e a
execução do comando são injetados por monkeypatch (mesmo padrão do
tests/test_config_store.py).

O que eles protegem são as duas coisas que custam caro quando quebram:

  1. A ALLOWLIST. É ela que separa "o painel manda um nome de tarefa" de "o
     painel manda uma linha de comando". Um furo aqui é execução arbitrária, e
     um afrouxamento na sanitização é conta de API (o `max`) ou argumento
     inventado (o `slug`).

  2. A MÁQUINA DE ESTADOS. Executar duas vezes gasta dinheiro de verdade e não
     tem desfazer. Toda transição é condicionada ao estado anterior; quem não
     consegue mudar a linha não executa.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator import worker as w


# ══════════════════════════════════════════════════════════════════════════
# Allowlist
# ══════════════════════════════════════════════════════════════════════════

TAREFAS_SEM_PARAMETRO = [
    "fase_a", "fase_a_free", "atletas", "produtos", "produtos_dia",
    "publicar", "tendencias", "planejar", "ideias_3d", "ideias_cursos",
]


@pytest.mark.parametrize("task", TAREFAS_SEM_PARAMETRO)
def test_tarefa_da_allowlist_vira_comando(task):
    args = w.build_args(task, {})
    assert args and args[0] == "-m" and args[1].startswith("orchestrator.")


@pytest.mark.parametrize("task", [
    "", "nao_existe", "phase_a", "FASE_A",
    "fase_a; rm -rf /", "-m os --help", "orchestrator.phase_a",
])
def test_tarefa_fora_da_allowlist_nao_vira_comando(task):
    """O nome da tarefa é uma CHAVE, não um pedaço de linha de comando."""
    assert w.build_args(task, {}) is None


def test_a_allowlist_e_a_mesma_da_rota_web():
    """Se alguém acrescentar tarefa no route.ts e esquecer daqui, a fila aceita
    o pedido e o worker o rejeita — o botão vira tela morta de novo, só que
    agora com uma linha vermelha no painel. Este teste lê o TypeScript."""
    rota = Path(__file__).resolve().parent.parent / "web" / "app" / "api" / "run" / "route.ts"
    texto = rota.read_text(encoding="utf-8")
    da_rota = set(__import__("re").findall(r'case "([a-z0-9_]+)":', texto))
    do_worker = set(TAREFAS_SEM_PARAMETRO) | {"carrossel", "plataformas", "curso"}
    assert da_rota == do_worker


# ── parâmetros: `max` ──────────────────────────────────────────────────────

@pytest.mark.parametrize("entrada,esperado", [
    (None, 2), ("", 2), (0, 2), ("abc", 2),      # ausente/inválido → o padrão do painel
    (1, 1), (3, 3), ("5", 5),
    (99, 10), (10**9, 10),                        # o teto é o freio de gasto de API
    (-4, 1), ("-4", 1),
])
def test_max_e_grampeado_entre_1_e_10(entrada, esperado):
    assert w.build_args("fase_a", {"max": entrada}) == [
        "-m", "orchestrator.phase_a", "--max", str(esperado)]


# ── parâmetros: `slug` ─────────────────────────────────────────────────────

def test_slug_valido_vira_argumento():
    assert w.build_args("carrossel", {"slug": "helena-crevar-mundial"}) == [
        "-m", "orchestrator.build_carousel", "helena-crevar-mundial"]


@pytest.mark.parametrize("slug", [
    None, "", "Maiuscula", "com espaco", "acentuação", "ponto.py",
    "; whoami", "../../etc/passwd", "a" * 81, "barra/no/meio",
])
def test_slug_invalido_derruba_a_tarefa(slug):
    """Sem slug bom não existe comando: melhor falhar do que rodar com o slug
    de outro dossiê."""
    assert w.build_args("carrossel", {"slug": slug}) is None
    assert w.build_args("plataformas", {"slug": slug}) is None


@pytest.mark.parametrize("slug", ["--dry-run", "--no-art", "-m", "--slides"])
def test_slug_nao_pode_ser_uma_flag_disfarcada(slug):
    """`--dry-run` e `--no-art` casam com `^[a-z0-9-]+$` e são flags DE VERDADE
    do build_carousel e do build_platforms. Sem shell não há injeção, mas um
    parâmetro do painel não pode virar opção do script."""
    assert w.build_args("carrossel", {"slug": slug}) is None
    assert w.build_args("plataformas", {"slug": slug}) is None


# ── parâmetros: `tema` ─────────────────────────────────────────────────────

def test_tema_preserva_acento_porque_o_produto_e_em_portugues():
    assert w.build_args("curso", {"tema": "montada inescapável"}) == [
        "-m", "orchestrator.build_course", "--tema", "montada inescapável"]


@pytest.mark.parametrize("entrada,esperado", [
    ("guarda; rm -rf /", "guarda rm -rf"),
    ("raspagem $(whoami)", "raspagem whoami"),
    ("--tema=outro", "temaoutro"),   # o '=' cai e o hífen da borda também
])
def test_tema_perde_tudo_que_nao_e_letra_numero_espaco_ou_hifen(entrada, esperado):
    args = w.build_args("curso", {"tema": entrada})
    assert args is not None and args[-1] == esperado


def test_tema_nunca_comeca_com_hifen():
    """Valor que começa com '-' é lido como flag pelo argparse: o `--tema`
    ficaria sem valor e o comando morreria com uma mensagem inútil."""
    args = w.build_args("curso", {"tema": "--dry-run"})
    assert args is None or not args[-1].startswith("-")


def test_tema_e_cortado_em_80():
    args = w.build_args("curso", {"tema": "a" * 200})
    assert args is not None and len(args[-1]) == 80


@pytest.mark.parametrize("tema", [None, "", "!!!", "@#$%"])
def test_tema_que_some_na_limpeza_derruba_a_tarefa(tema):
    assert w.build_args("curso", {"tema": tema}) is None


def test_params_ausente_ou_lixo_nao_levanta():
    """A linha vem do banco: `params` pode ser null, e um dia pode vir errado."""
    assert w.build_args("fase_a", None) == ["-m", "orchestrator.phase_a", "--max", "2"]
    assert w.build_args("fase_a", "nao é dict") == ["-m", "orchestrator.phase_a", "--max", "2"]
    assert w.build_args("carrossel", None) is None


# ══════════════════════════════════════════════════════════════════════════
# Máquina de estados da fila
# ══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def fila(monkeypatch):
    """Fila em memória com a MESMA semântica do PostgREST que o worker usa:
    o PATCH só pega a linha se o `status` atual for o esperado, e devolve
    quantas linhas mudaram. É esse retorno que impede execução duplicada."""
    linhas: dict[str, dict] = {}

    monkeypatch.setattr(w, "_habilitado", lambda: True)

    def pendentes(limite=1):
        ordenadas = sorted((l for l in linhas.values() if l["status"] == "pendente"),
                           key=lambda l: l["requested_at"])
        return [dict(l) for l in ordenadas[:limite]]

    def travadas(limite_iso):
        return [dict(l) for l in linhas.values()
                if l["status"] == "executando" and (l.get("started_at") or "") < limite_iso]

    def patch(linha_id, campos, se_status=None):
        linha = linhas.get(str(linha_id))
        if not linha or (se_status and linha["status"] != se_status):
            return 0
        linha.update(campos)
        return 1

    monkeypatch.setattr(w, "_db_pendentes", pendentes)
    monkeypatch.setattr(w, "_db_travadas", travadas)
    monkeypatch.setattr(w, "_db_patch", patch)
    return linhas


def enfileira(fila, task="fase_a", params=None, quando="2026-09-02T10:00:00+00:00", **extra):
    linha_id = f"id-{len(fila) + 1}"
    fila[linha_id] = {"id": linha_id, "task": task, "params": params or {},
                      "status": "pendente", "requested_at": quando,
                      "started_at": None, "finished_at": None, "run_id": None,
                      "error": None, **extra}
    return linha_id


@pytest.fixture
def executor(monkeypatch):
    """Substitui a execução real. Guarda o que foi chamado e devolve o que o
    teste mandar (código de saída + saída em texto)."""
    chamadas: list[list[str]] = []
    resultado = {"codigo": 0, "saida": "ok\n"}

    def roda(args, log_path):
        chamadas.append(args)
        if isinstance(resultado.get("erro"), Exception):
            raise resultado["erro"]
        return resultado["codigo"], resultado["saida"]

    monkeypatch.setattr(w, "_roda_comando", roda)
    return {"chamadas": chamadas, "resultado": resultado}


# ── caminho feliz ──────────────────────────────────────────────────────────

def test_pendente_vira_executando_e_depois_concluido(fila, executor):
    i = enfileira(fila, "fase_a", {"max": 3})
    assert w.processa_uma() == "concluido"
    assert fila[i]["status"] == "concluido"
    assert fila[i]["started_at"] and fila[i]["finished_at"] and fila[i]["run_id"]
    assert fila[i]["error"] is None
    assert executor["chamadas"] == [["-m", "orchestrator.phase_a", "--max", "3"]]


def test_fifo_a_mais_antiga_primeiro(fila, executor):
    nova = enfileira(fila, "tendencias", quando="2026-09-02T12:00:00+00:00")
    velha = enfileira(fila, "planejar", quando="2026-09-02T08:00:00+00:00")
    w.processa_uma()
    assert fila[velha]["status"] == "concluido"
    assert fila[nova]["status"] == "pendente"


def test_fila_vazia_devolve_none_sem_executar(fila, executor):
    assert w.processa_uma() is None
    assert executor["chamadas"] == []


# ── falha ──────────────────────────────────────────────────────────────────

def test_saida_diferente_de_zero_marca_falhou_com_o_motivo(fila, executor):
    i = enfileira(fila, "tendencias")
    executor["resultado"].update(codigo=1, saida="Traceback...\nANTHROPIC_API_KEY ausente\n")
    assert w.processa_uma() == "falhou"
    assert fila[i]["status"] == "falhou"
    assert "ANTHROPIC_API_KEY ausente" in fila[i]["error"]
    assert fila[i]["finished_at"]


def test_excecao_na_execucao_vira_falhou_e_nao_derruba_o_worker(fila, executor):
    i = enfileira(fila, "planejar")
    executor["resultado"]["erro"] = TimeoutError("30 min sem responder")
    assert w.processa_uma() == "falhou"
    assert fila[i]["status"] == "falhou"
    assert "30 min" in fila[i]["error"]


def test_tarefa_invalida_na_fila_falha_sem_executar(fila, executor):
    """Lixo na fila (rota antiga, escrita direta no banco) não vira comando."""
    i = enfileira(fila, "tarefa_que_nao_existe")
    assert w.processa_uma() == "falhou"
    assert fila[i]["status"] == "falhou"
    assert executor["chamadas"] == []


def test_parametro_obrigatorio_ausente_falha_sem_executar(fila, executor):
    i = enfileira(fila, "carrossel", {"slug": "MAIÚSCULO INVÁLIDO"})
    assert w.processa_uma() == "falhou"
    assert fila[i]["status"] == "falhou"
    assert executor["chamadas"] == []


# ── nunca duas vezes ───────────────────────────────────────────────────────

def test_tarefa_ja_executando_nao_e_pega_de_novo(fila, executor):
    enfileira(fila, "fase_a", status="executando")
    assert w.processa_uma() is None
    assert executor["chamadas"] == []


def test_quem_perde_a_corrida_pelo_claim_nao_executa(fila, executor, monkeypatch):
    """Dois workers, a mesma linha: o PATCH condicionado faz um receber 1 e o
    outro 0. Quem recebe 0 não pode executar — seria gasto de API em dobro."""
    enfileira(fila, "fase_a")
    monkeypatch.setattr(w, "_db_patch", lambda *a, **k: 0)  # o outro chegou antes
    assert w.processa_uma() is None
    assert executor["chamadas"] == []


def test_banco_fora_do_ar_na_leitura_nao_executa(fila, executor, monkeypatch):
    enfileira(fila, "fase_a")

    def explode(*a, **k):
        raise ConnectionError("banco fora do ar")

    monkeypatch.setattr(w, "_db_pendentes", explode)
    assert w.processa_uma() is None
    assert executor["chamadas"] == []


def test_banco_fora_do_ar_no_claim_nao_executa(fila, executor, monkeypatch):
    """O pior caso possível: ler a fila funciona, marcar 'executando' não. Sem
    confirmação de posse NÃO se executa — a tarefa fica pendente, que é o
    estado seguro (o pior que acontece é rodar na próxima passada)."""
    i = enfileira(fila, "fase_a")

    def explode(*a, **k):
        raise ConnectionError("caiu no meio do PATCH")

    monkeypatch.setattr(w, "_db_patch", explode)
    assert w.processa_uma() is None
    assert executor["chamadas"] == []
    assert fila[i]["status"] == "pendente"


# ── destravar ──────────────────────────────────────────────────────────────

def _ha(horas: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()


def test_executando_ha_mais_de_2h_volta_pra_pendente(fila):
    """Worker morto no meio deixa a linha travada pra sempre: ninguém executa e
    ninguém reclama. Depois de 2h ela volta pra fila."""
    i = enfileira(fila, "fase_a", status="executando", started_at=_ha(3), run_id="velho")
    assert w.recupera_travadas() == 1
    assert fila[i]["status"] == "pendente"
    assert fila[i]["started_at"] is None and fila[i]["run_id"] is None


def test_executando_ha_pouco_tempo_e_deixada_em_paz(fila):
    """Tarefa em andamento não pode voltar pra fila — daria execução dupla."""
    i = enfileira(fila, "fase_a", status="executando", started_at=_ha(0.5))
    assert w.recupera_travadas() == 0
    assert fila[i]["status"] == "executando"


def test_destravar_nao_atropela_quem_acabou_de_terminar(fila, monkeypatch):
    """Corrida real: a linha aparece na leitura como travada, mas o worker
    original a finaliza antes do PATCH. O `se_status='executando'` protege."""
    i = enfileira(fila, "fase_a", status="executando", started_at=_ha(3))
    original = w._db_travadas
    monkeypatch.setattr(w, "_db_travadas", lambda limite: (
        fila[i].update(status="concluido") or original(limite) or [dict(fila[i])]))
    assert w.recupera_travadas() == 0
    assert fila[i]["status"] == "concluido"


def test_banco_fora_do_ar_no_destrave_nao_levanta(fila, monkeypatch):
    def explode(*a, **k):
        raise ConnectionError("fora do ar")

    monkeypatch.setattr(w, "_db_travadas", explode)
    assert w.recupera_travadas() == 0


# ── drenagem ───────────────────────────────────────────────────────────────

def test_drena_processa_todas_e_para_sozinha(fila, executor):
    for _ in range(3):
        enfileira(fila, "tendencias")
    assert w.drena() == {"concluido": 3, "falhou": 0}
    assert len(executor["chamadas"]) == 3


def test_drena_respeita_o_teto_e_deixa_o_resto_na_fila(fila, executor):
    """Se alguém enfileirar em massa, o ciclo diário não vira fatura de API."""
    for _ in range(5):
        enfileira(fila, "tendencias")
    assert w.drena(limite=2)["concluido"] == 2
    assert sum(1 for l in fila.values() if l["status"] == "pendente") == 3


def test_drena_conta_falha_e_segue_para_a_proxima(fila, executor, monkeypatch):
    enfileira(fila, "tarefa_invalida")
    enfileira(fila, "tendencias")
    assert w.drena() == {"concluido": 1, "falhou": 1}


def test_sem_credencial_a_drenagem_e_no_op(fila, executor, monkeypatch):
    """Sem Supabase não existe fila — e isso não pode ser erro, é o modo local."""
    enfileira(fila, "fase_a")
    monkeypatch.setattr(w, "_habilitado", lambda: False)
    assert w.drena() == {"concluido": 0, "falhou": 0}
    assert executor["chamadas"] == []
