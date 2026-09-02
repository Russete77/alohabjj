"""
lib/jobs.py — Observabilidade e idempotência (PRD §9.3).

Cada run escreve um JSONL em jobs/<run_id>.jsonl com uma linha por etapa:
{step, key?, custom_id?, status, model?, in_tok?, out_tok?, cost_est?, t0, t1, error?}

Resumível: `already_succeeded(step, key)` deixa um passo pular trabalho já feito
consultando os logs anteriores. Sem dependências externas.

`custo_do_dia()` soma o gasto do dia inteiro (todos os runs), que é o que o teto
diário precisa saber — cada JobLog só enxerga o próprio arquivo.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

# raiz do repo = pai de lib/
ROOT = Path(__file__).resolve().parent.parent
JOBS_DIR = ROOT / "jobs"


def _now() -> float:
    return time.time()


def new_run_id(prefix: str = "run") -> str:
    """ID de run legível e ordenável: <prefix>-YYYYmmdd-HHMMSS."""
    return f"{prefix}-{time.strftime('%Y%m%d-%H%M%S', time.localtime())}"


class JobLog:
    """Logger append-only de um run. Uma instância por execução."""

    def __init__(self, run_id: str | None = None, prefix: str = "run"):
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        self.run_id = run_id or new_run_id(prefix)
        self.path = JOBS_DIR / f"{self.run_id}.jsonl"

    def record(
        self,
        step: str,
        status: str,
        *,
        key: str | None = None,
        custom_id: str | None = None,
        model: str | None = None,
        in_tok: int | None = None,
        out_tok: int | None = None,
        cost_est: float | None = None,
        t0: float | None = None,
        t1: float | None = None,
        error: str | None = None,
        **extra: Any,
    ) -> None:
        entry = {
            "ts": _now(),
            "run_id": self.run_id,
            "step": step,
            "status": status,
            "key": key,
            "custom_id": custom_id,
            "model": model,
            "in_tok": in_tok,
            "out_tok": out_tok,
            "cost_est": cost_est,
            "t0": t0,
            "t1": t1,
            "error": error,
        }
        entry.update(extra)
        # remove chaves None para manter o log enxuto
        entry = {k: v for k, v in entry.items() if v is not None}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        # dual-write best-effort no Supabase (no-op sem credencial; nunca quebra o run)
        try:
            from lib import db
            db.log_step(entry)
        except Exception:  # noqa: BLE001
            pass

    def total_cost(self) -> float:
        """Soma cost_est das linhas deste run (para spend cap / relatório)."""
        return _sum_cost([self.path])


def _iter_lines(paths: Iterable[Path]) -> Iterable[dict]:
    for p in paths:
        if not p.exists():
            continue
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def _sum_cost(paths: Iterable[Path]) -> float:
    return round(sum(e.get("cost_est", 0.0) or 0.0 for e in _iter_lines(paths)), 6)


# ── custo do DIA (teto diário) ───────────────────────────────────────────────
# O teto por run (SPEND_CAP_USD) nunca segurou o dia: cada JobLog soma só o próprio
# arquivo, então dez runs de $5 gastavam $50 sem nada barrar. Aqui a soma é do dia
# inteiro, atravessando todos os jobs/*.jsonl.
#
# Cache em memória por processo: caminho -> (bytes já lidos, {dia: custo}). Só os
# bytes NOVOS são lidos a cada chamada — o pipeline chama isto antes de CADA chamada
# de modelo, e já_teve_sucesso() mostra o preço de reler o histórico inteiro toda vez.
_CACHE_DIA: dict[str, tuple[int, dict[str, float]]] = {}


def limpar_cache_custo() -> None:
    """Descarta o cache do custo do dia (usado nos testes e ao trocar de JOBS_DIR)."""
    _CACHE_DIA.clear()


def dia_local(ts: float) -> str:
    """Dia civil no fuso da máquina — o teto é 'por dia', não 'por 24h UTC'."""
    return time.strftime("%Y-%m-%d", time.localtime(ts))


def _atualiza(path: Path, hoje: str) -> dict[str, float]:
    """Lê só o que foi acrescentado ao arquivo desde a última passada."""
    chave = str(path)
    offset, dias = _CACHE_DIA.get(chave, (0, {}))
    tamanho = path.stat().st_size
    if tamanho < offset:  # arquivo truncado/reescrito: o offset guardado virou lixo
        offset, dias = 0, {}
    if tamanho > offset:
        with path.open("rb") as f:
            f.seek(offset)
            bruto = f.read(tamanho - offset)
        # Corta na última quebra de linha: o run pode estar escrevendo AGORA e a
        # última linha vir pela metade. O resto entra na próxima chamada.
        corte = bruto.rfind(b"\n")
        if corte >= 0:
            dias = dict(dias)
            for linha in bruto[: corte + 1].decode("utf-8", "replace").splitlines():
                linha = linha.strip()
                if not linha:
                    continue
                try:
                    e = json.loads(linha)
                except json.JSONDecodeError:
                    continue  # linha corrompida não pode derrubar a conta do teto
                custo = e.get("cost_est") or 0.0
                if not custo:
                    continue
                # Sem ts não dá pra datar o gasto. Falhar fechado: conta no dia de
                # hoje (some da conta = liberar gasto que já aconteceu).
                d = dia_local(e["ts"]) if e.get("ts") else hoje
                dias[d] = dias.get(d, 0.0) + custo
            offset += corte + 1
        _CACHE_DIA[chave] = (offset, dias)
    elif chave not in _CACHE_DIA:
        _CACHE_DIA[chave] = (offset, dias)
    return dias


def custo_do_dia(dia: str | None = None) -> float:
    """
    Soma `cost_est` de TODAS as linhas de jobs/*.jsonl caídas no dia (default: hoje).

    Levanta se não conseguir ler o histórico — quem chama tem que tratar como
    "bloqueia", nunca como "pode gastar". Erro de disco não é licença pra gastar.
    """
    hoje = dia or dia_local(_now())
    total = 0.0
    if JOBS_DIR.exists():
        for p in sorted(JOBS_DIR.glob("*.jsonl")):
            total += _atualiza(p, hoje).get(hoje, 0.0)
    return round(total, 6)


def already_succeeded(step: str, key: str) -> bool:
    """
    True se qualquer run anterior registrou (step, key) com status 'succeeded'.
    Usado para tornar as etapas resumíveis/idempotentes.
    """
    for entry in _iter_lines(sorted(JOBS_DIR.glob("*.jsonl"))):
        if (
            entry.get("step") == step
            and entry.get("key") == key
            and entry.get("status") == "succeeded"
        ):
            return True
    return False
