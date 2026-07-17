"""
lib/db.py — Dual-write pro Supabase (Postgres via PostgREST). Assíncrono e opcional.

Regra: os arquivos continuam sendo o artefato; o banco é o índice/estado/memória.
Sem SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → TUDO vira no-op; o pipeline roda igual.

IMPORTANTE (perf): as escritas são ENFILEIRADAS e enviadas por uma THREAD DE FUNDO
(fire-and-forget), pra não travar o caminho quente do pipeline (o JobLog.record é
chamado a cada passo de agente). Flush automático no fim do processo (atexit).
Rode antes: db/schema.sql + db/seed_products.sql no seu projeto Supabase.
"""
from __future__ import annotations

import atexit
import json
import os
import queue
import threading
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

_Q: "queue.Queue" = queue.Queue(maxsize=2000)
_SEEN_RUNS: set[str] = set()
_LOCK = threading.Lock()
_STARTED = False


def enabled() -> bool:
    return bool(_URL and _KEY)


def _post(table: str, rows: list[dict], on_conflict: str | None = None) -> None:
    """POST síncrono no PostgREST (roda SÓ na thread de fundo). Best-effort, nunca levanta."""
    if not rows:
        return
    url = f"{_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    prefer = "resolution=merge-duplicates,return=minimal" if on_conflict else "return=minimal"
    req = urllib.request.Request(url, data=json.dumps(rows).encode("utf-8"), method="POST", headers={
        "apikey": _KEY, "Authorization": f"Bearer {_KEY}",
        "Content-Type": "application/json", "Prefer": prefer,
    })
    try:
        with urllib.request.urlopen(req, timeout=3):  # timeout curto
            pass
    except Exception:  # noqa: BLE001 — o DB nunca pode derrubar nem travar o pipeline
        pass


def _worker() -> None:
    while True:
        item = _Q.get()
        if item is None:
            _Q.task_done()
            break
        table, rows, on_conflict = item
        _post(table, rows, on_conflict)
        _Q.task_done()


def _ensure_worker() -> None:
    global _STARTED
    if _STARTED or not enabled():
        return
    with _LOCK:
        if _STARTED:
            return
        threading.Thread(target=_worker, daemon=True).start()
        atexit.register(_flush)
        _STARTED = True


def _flush() -> None:
    try:
        _Q.join()  # espera a fila drenar no fim do processo (não durante o run)
    except Exception:  # noqa: BLE001
        pass


def _enqueue(table: str, rows: list[dict], on_conflict: str | None = None) -> None:
    if not enabled() or not rows:
        return
    _ensure_worker()
    try:
        _Q.put_nowait((table, rows, on_conflict))
    except queue.Full:
        pass  # se a fila encher, descarta (o arquivo é a fonte de verdade)


# ── agentes (a memória que os acompanha) ─────────────────────────────────────
def log_step(entry: dict) -> None:
    """Espelha uma linha do JobLog em agent_steps. Só estados finais (não running/retry)."""
    if not enabled() or entry.get("status") in (None, "running", "retry"):
        return
    run_id = entry.get("run_id", "")
    with _LOCK:
        first = bool(run_id) and run_id not in _SEEN_RUNS
        if first:
            _SEEN_RUNS.add(run_id)
    if first:  # cria o run UMA vez (não a cada passo)
        _enqueue("agent_runs", [{"run_id": run_id}], on_conflict="run_id")
    row = {k: entry.get(k) for k in (
        "run_id", "step", "status", "key", "custom_id", "model",
        "in_tok", "out_tok", "cost_est", "t0", "t1", "error") if entry.get(k) is not None}
    _enqueue("agent_steps", [row])


# ── conteúdo (índice consultável) ────────────────────────────────────────────
def upsert_dossier(row: dict) -> None:
    _enqueue("dossiers", [row], on_conflict="slug")


def upsert_piece(row: dict) -> None:
    _enqueue("pieces", [row], on_conflict="slug")


def upsert_products(rows: list[dict]) -> None:
    _enqueue("products", rows, on_conflict="id")


def insert_event(row: dict) -> None:
    """Evento de conversão (click/conversion) → tabela events."""
    _enqueue("events", [{k: v for k, v in row.items() if v is not None}])


if __name__ == "__main__":
    print(f"[db] Supabase dual-write: {'ATIVO (assíncrono)' if enabled() else 'off (sem SUPABASE_URL/SERVICE_ROLE_KEY)'}")
