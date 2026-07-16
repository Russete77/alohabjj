"""
orchestrator/build_platforms.py — Empacota uma peça aprovada por plataforma.

Roda o agente Empacotador (Sonnet) sobre outputs/<slug>/ (slides + caption + meta)
e grava outputs/<slug>/platforms.json com pacotes prontos para copiar-e-colar:
Instagram (feed + Reels), TikTok e YouTube Shorts.

Requer ANTHROPIC_API_KEY.
Uso:
    python -m orchestrator.build_platforms <slug>
    python -m orchestrator.build_platforms <slug> --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
SYSTEM = (ROOT / "agents" / "packager" / "system.md").read_text(encoding="utf-8")

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "instagram_feed": {"type": "object", "additionalProperties": False,
            "properties": {"caption": {"type": "string"}, "primeiro_comentario": {"type": "string"},
                           "hashtags": {"type": "array", "items": {"type": "string"}}, "alt_text": {"type": "string"}},
            "required": ["caption", "primeiro_comentario", "hashtags", "alt_text"]},
        "instagram_reels": {"type": "object", "additionalProperties": False,
            "properties": {"caption": {"type": "string"}, "hook": {"type": "string"},
                           "hashtags": {"type": "array", "items": {"type": "string"}}, "audio_sugestao": {"type": "string"}},
            "required": ["caption", "hook", "hashtags", "audio_sugestao"]},
        "tiktok": {"type": "object", "additionalProperties": False,
            "properties": {"caption": {"type": "string"}, "hashtags": {"type": "array", "items": {"type": "string"}},
                           "roteiro_fala": {"type": "string"}, "is_ai_generated": {"type": "boolean"}},
            "required": ["caption", "hashtags", "roteiro_fala", "is_ai_generated"]},
        "youtube_shorts": {"type": "object", "additionalProperties": False,
            "properties": {"titulo": {"type": "string"}, "descricao": {"type": "string"},
                           "tags": {"type": "array", "items": {"type": "string"}}},
            "required": ["titulo", "descricao", "tags"]},
    },
    "required": ["instagram_feed", "instagram_reels", "tiktok", "youtube_shorts"],
}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out = OUTPUTS / args.slug
    if not (out / "meta.json").exists():
        raise SystemExit(f"Peça não encontrada em outputs/{args.slug}. Rode build_carousel antes.")
    slides = (out / "slides.json").read_text(encoding="utf-8")
    caption = (out / "caption.txt").read_text(encoding="utf-8")
    meta = (out / "meta.json").read_text(encoding="utf-8")
    voz = (ROOT / "config" / "voz.md").read_text(encoding="utf-8")

    if args.dry_run:
        print(f"[plataformas] --dry-run: prompt montado para {args.slug}; NENHUMA chamada à API.")
        return 0

    log = JobLog(prefix="plataformas")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[plataformas] {e}")
        return 1
    txt, usage = claude.call(
        model=SONNET, system=SYSTEM,
        user=f"VOZ:\n{voz}\n\nBRIEF/META:\n{meta}\n\nSLIDES:\n{slides}\n\nCAPTION BASE:\n{caption}",
        step="packager", key=args.slug, json_schema=SCHEMA, max_tokens=3000)
    (out / "platforms.json").write_text(json.dumps(json.loads(txt), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[plataformas] OK → {out / 'platforms.json'} · custo ≈ ${usage['cost']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
