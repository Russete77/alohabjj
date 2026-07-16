"""
orchestrator/dedupe.py — Dedupe do Radar (PRD §6).

Para cada pauta nova, decide: **tópico novo** (cria dossiê) ou **enriquece** um
dossiê existente. Usa slug canônico + similaridade (embedding hospedado se houver
chave; senão fallback léxico grátis) contra os títulos da base em knowledge/.

Determinístico/grátis no modo léxico — roda sem chave.
Uso:
    python -m orchestrator.dedupe            # roda contra as pautas de RSS ao vivo
    python -m orchestrator.dedupe --threshold 0.55
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.embeddings import similarity, which  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"
BACKFILL = KNOWLEDGE / "_backfill"

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:90]


def base_titles() -> list[tuple[str, str]]:
    """(slug, titulo) de todos os dossiês da base (fora _backfill)."""
    out = []
    for d in KNOWLEDGE.iterdir():
        if not d.is_dir() or d.name == "_backfill":
            continue
        meta = d / "metadata.json"
        title = None
        bf = BACKFILL / f"{d.name}.json"
        if bf.exists():
            try:
                title = json.loads(bf.read_text(encoding="utf-8")).get("title")
            except json.JSONDecodeError:
                pass
        if not title:
            title = d.name.replace("-", " ")
        out.append((d.name, title))
    return out


def classify(title: str, base: list[tuple[str, str]], threshold: float = 0.5) -> dict:
    """Decide novo/enriquecer para uma pauta, comparando com a base."""
    item_slug = slugify(title)
    best_slug, best_title, best_score, method = None, None, 0.0, "lexical"
    for slug, btitle in base:
        # slug idêntico = mesmo tópico na certa
        if slug == item_slug:
            return {"decisao": "enriquecer", "slug": slug, "dossie_existente": slug,
                    "score": 1.0, "metodo": "slug", "motivo": "slug canônico idêntico"}
        score, method = similarity(title, btitle)
        if score > best_score:
            best_slug, best_title, best_score = slug, btitle, score
    if best_score >= threshold:
        return {"decisao": "enriquecer", "slug": item_slug, "dossie_existente": best_slug,
                "score": round(best_score, 3), "metodo": method,
                "motivo": f"parecido com '{best_title}'"}
    return {"decisao": "novo", "slug": item_slug, "dossie_existente": None,
            "score": round(best_score, 3), "metodo": method, "motivo": "sem correspondência na base"}


def main() -> int:
    from ingestion.rss import fetch_new_items
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--limit", type=int, default=25)
    args = ap.parse_args()

    base = base_titles()
    print(f"[dedupe] base: {len(base)} dossiês · método de similaridade: {which()}\n")
    items = fetch_new_items(limit=args.limit, mark_seen=False)
    novos, enriquecer = 0, 0
    for it in items:
        d = classify(it["titulo"], base, args.threshold)
        if d["decisao"] == "novo":
            novos += 1
            print(f"  🆕 NOVO   [{it['fonte']}] {it['titulo']}  (max sim {d['score']})")
        else:
            enriquecer += 1
            print(f"  ♻️  EXISTE [{it['fonte']}] {it['titulo']}  → {d['dossie_existente']} ({d['score']})")
    print(f"\n[dedupe] {novos} novos · {enriquecer} enriquecer (de {len(items)} pautas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
