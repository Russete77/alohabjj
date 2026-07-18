"""
lib/candidates.py — Candidatos de produto (saída do Product Scout → gate do Lucas).

O Scout acha campeões nos marketplaces, classifica e escreve a copy; o candidato fica
em data/product_candidates.json (arquivo = artefato) + dual-write no Supabase
(product_candidates). O /admin/produtos lê esse JSON pra aprovar/reprovar; aprovar cria
o produto no catálogo (config/catalogo.yaml), que a Loja e o Supervisor já usam.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "data" / "product_candidates.json"


def _load_all() -> list[dict]:
    if not FILE.exists():
        return []
    try:
        return json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return []


def _save_all(rows: list[dict]) -> None:
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def add(candidate: dict) -> dict:
    """Grava um candidato (dedup por id_sugerido+fonte)."""
    rows = _load_all()
    cid = candidate.get("id_sugerido") or f"cand{int(time.time())}"
    key = (cid, candidate.get("fonte", ""))
    rows = [r for r in rows if (r.get("id_sugerido"), r.get("fonte", "")) != key]
    row = {**candidate, "id": cid, "status": candidate.get("status", "proposto"),
           "created": time.time()}
    rows.append(row)
    _save_all(rows)
    try:  # dual-write best-effort no Supabase (product_candidates)
        from lib import db
        if db.enabled():
            db.insert_candidate({
                "kind": candidate.get("tipo", "afiliado"),
                "fonte": candidate.get("fonte") or None,
                "external_url": candidate.get("external_url"),
                "titulo": candidate.get("nome"),
                "preco": _num(candidate.get("preco")),
                "imagem_url": candidate.get("imagem_url"),
                "score": candidate.get("score"),
                "motivo": candidate.get("motivo"),
                "status": "proposto",
            })
    except Exception:  # noqa: BLE001
        pass
    return row


def _num(v) -> float | None:
    try:
        import re
        m = re.search(r"[\d.,]+", str(v or ""))
        return float(m.group().replace(".", "").replace(",", ".")) if m else None
    except Exception:  # noqa: BLE001
        return None


def load() -> list[dict]:
    return sorted(_load_all(), key=lambda r: (-(r.get("score") or 0), -(r.get("created") or 0)))
