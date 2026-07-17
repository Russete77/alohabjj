"""
lib/db.py — Dual-write pro Supabase (Postgres via PostgREST). Best-effort e opcional.

Regra: os arquivos continuam sendo o artefato; o banco é o índice/estado/memória.
Se SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY não estiverem no .env, TUDO vira no-op —
o pipeline roda igual, só não espelha no banco. Nenhuma falha de DB quebra o run.

Usa PostgREST direto (urllib), sem depender do SDK supabase-py.
Rode antes: db/schema.sql + db/seed_products.sql no seu projeto Supabase.
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""


def enabled() -> bool:
    return bool(_URL and _KEY)


def _post(table: str, rows: list[dict], on_conflict: str | None = None) -> bool:
    """Upsert best-effort no PostgREST. Retorna True/False; nunca levanta."""
    if not enabled() or not rows:
        return False
    url = f"{_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    body = json.dumps(rows).encode("utf-8")
    prefer = "resolution=merge-duplicates,return=minimal" if on_conflict else "return=minimal"
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": _KEY, "Authorization": f"Bearer {_KEY}",
        "Content-Type": "application/json", "Prefer": prefer,
    })
    try:
        with urllib.request.urlopen(req, timeout=8):
            return True
    except Exception:  # noqa: BLE001 — DB nunca pode derrubar o pipeline
        return False


# ── agentes (a memória que os acompanha) ─────────────────────────────────────
def ensure_run(run_id: str, kind: str = "", phase: str = "") -> None:
    _post("agent_runs", [{"run_id": run_id, "kind": kind, "phase": phase}], on_conflict="run_id")


def log_step(entry: dict) -> None:
    """Espelha uma linha do JobLog em agent_steps (só estados finais, não 'running')."""
    if not enabled():
        return
    if entry.get("status") in (None, "running"):
        return
    ensure_run(entry.get("run_id", ""))
    row = {k: entry.get(k) for k in (
        "run_id", "step", "status", "key", "custom_id", "model",
        "in_tok", "out_tok", "cost_est", "t0", "t1", "error") if entry.get(k) is not None}
    _post("agent_steps", [row])


# ── conteúdo (índice consultável) ────────────────────────────────────────────
def upsert_dossier(row: dict) -> None:
    _post("dossiers", [row], on_conflict="slug")


def upsert_piece(row: dict) -> None:
    _post("pieces", [row], on_conflict="slug")


def upsert_products(rows: list[dict]) -> None:
    _post("products", rows, on_conflict="id")


if __name__ == "__main__":
    print(f"[db] Supabase dual-write: {'ATIVO' if enabled() else 'off (sem SUPABASE_URL/SERVICE_ROLE_KEY)'}")
