"""
ingestion/backfill_images.py — Preenche a imagem das notícias que estão SEM foto.

Passa por knowledge/<slug>/metadata.json; quando não há `imagem` mas há `source_url`,
busca a og:image do artigo-fonte (grátis, sem IA), baixa pra web/public/hero/<slug>.jpg
e grava `imagem: /hero/<slug>.jpg`. Idempotente (pula quem já tem).

Uso:
    python -m ingestion.backfill_images            # preenche o que falta
    python -m ingestion.backfill_images --force    # rebaixa todas
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from orchestrator.build_dossiers import portal_image  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebaixa mesmo quem já tem imagem")
    args = ap.parse_args()

    slugs = [d for d in KNOWLEDGE.iterdir()
             if d.is_dir() and d.name != "_backfill" and (d / "metadata.json").exists()]
    ok, skip, fail = 0, 0, 0
    for d in slugs:
        mp = d / "metadata.json"
        meta = json.loads(mp.read_text(encoding="utf-8"))
        if meta.get("imagem") and not args.force:
            skip += 1
            continue
        img = portal_image(meta.get("source_url"), d.name)
        if img:
            meta["imagem"] = img
            mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
            ok += 1
            print(f"  ✓ {d.name} ← {img}")
        else:
            fail += 1
            print(f"  · {d.name}: sem og:image (fonte: {meta.get('source_url') or '—'})")

    print(f"\n[backfill-imagens] preenchidas={ok} · já tinham={skip} · sem imagem={fail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
