"""
orchestrator/build_platforms.py — Empacota uma peça aprovada por plataforma + arte.

Sobre outputs/<slug>/ (slides + caption + meta):
  - Instagram Publisher (Sonnet) → legenda BR + EUA, palavras-chave, headlines topo/capa
  - TikTok Publisher   (Sonnet) → pacote viral nativo (hook, beats, loop, CTA)
  - Empacotador        (Sonnet) → YouTube Shorts (título, descrição, tags)
  - Arte (orchestrator.art) → Diretor de Arte → IA + QC por visão → headline coerente → card,
                              ou FRAME PRÓPRIO se sem chave de imagem. Nunca foto de terceiro.

Grava outputs/<slug>/platforms.json (instagram, tiktok, youtube, arte) + story.png.

Requer ANTHROPIC_API_KEY.
Uso:
    python -m orchestrator.build_platforms <slug>
    python -m orchestrator.build_platforms <slug> --dry-run
    python -m orchestrator.build_platforms <slug> --no-art   # pula a arte
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402
from orchestrator import art  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
AGENTS = ROOT / "agents"


def _sys(name: str) -> str:
    return (AGENTS / name / "system.md").read_text(encoding="utf-8")


IG_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "emocao_dominante": {"type": "string"},
        "legenda_br": {"type": "string"},
        "legenda_us": {"type": "string"},
        "palavras_chave_extras": {"type": "array", "items": {"type": "string"}},
        "headline_topo": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"emocao": {"type": "string"}, "texto": {"type": "string"}},
            "required": ["emocao", "texto"]}},
        "headline_capa": {"type": "array", "items": {"type": "string"}},
        "is_ai_generated": {"type": "boolean"},
    },
    "required": ["emocao_dominante", "legenda_br", "legenda_us", "palavras_chave_extras",
                 "headline_topo", "headline_capa", "is_ai_generated"],
}

TIKTOK_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "emocao_dominante": {"type": "string"},
        "hook_fala": {"type": "string"}, "hook_tela": {"type": "string"},
        "roteiro_beats": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"tempo": {"type": "string"}, "fala": {"type": "string"}, "texto_tela": {"type": "string"}},
            "required": ["tempo", "fala", "texto_tela"]}},
        "caption": {"type": "string"}, "hashtags": {"type": "array", "items": {"type": "string"}},
        "audio_sugestao": {"type": "string"}, "cta_comentario": {"type": "string"},
        "gancho_loop": {"type": "string"}, "headline_capa": {"type": "string"},
        "is_ai_generated": {"type": "boolean"},
    },
    "required": ["emocao_dominante", "hook_fala", "hook_tela", "roteiro_beats", "caption",
                 "hashtags", "audio_sugestao", "cta_comentario", "gancho_loop", "headline_capa", "is_ai_generated"],
}

YT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"titulo": {"type": "string"}, "descricao": {"type": "string"},
                   "tags": {"type": "array", "items": {"type": "string"}}},
    "required": ["titulo", "descricao", "tags"],
}

YT_SYSTEM = (
    "Você é o Social Media Manager da BjjcomLucas para YouTube Shorts. Dado o dossiê/peça, "
    "produza um pacote pronto: título ≤100 caracteres com gancho e #Shorts, descrição com CTA "
    "e link (curso 100kg – Domínio Absoluto no link), e 8–12 tags de nicho. PT-BR, autoridade "
    "no Jiu-Jitsu, sem clickbait enganoso, sem inventar fato."
)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-art", action="store_true", help="não gera a arte")
    args = ap.parse_args()

    out = OUTPUTS / args.slug
    if not (out / "meta.json").exists():
        raise SystemExit(f"Peça não encontrada em outputs/{args.slug}. Rode build_carousel antes.")
    slides = (out / "slides.json").read_text(encoding="utf-8")
    caption = (out / "caption.txt").read_text(encoding="utf-8")
    meta = (out / "meta.json").read_text(encoding="utf-8")
    voz = (ROOT / "config" / "voz.md").read_text(encoding="utf-8")
    ctx = f"VOZ:\n{voz}\n\nBRIEF/META:\n{meta}\n\nSLIDES:\n{slides}\n\nCAPTION BASE:\n{caption}"

    if args.dry_run:
        print(f"[plataformas] --dry-run: prompts montados para {args.slug}; NENHUMA chamada à API.")
        return 0

    log = JobLog(prefix="plataformas")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[plataformas] {e}")
        return 1

    # 1) Instagram Publisher (prompt mestre)
    ig_txt, _ = claude.call(model=SONNET, system=_sys("instagram_publisher"), user=ctx,
                            step="instagram", key=args.slug, json_schema=IG_SCHEMA,
                            effort="medium", max_tokens=5000)
    ig = json.loads(ig_txt)
    print(f"  ✓ Instagram: emoção={ig['emocao_dominante']} · legenda_br={len(ig['legenda_br'])}c · "
          f"{len(ig['headline_capa'])} capas")

    # 2) TikTok Publisher (viral, BR)
    tk_txt, _ = claude.call(model=SONNET, system=_sys("tiktok_publisher"), user=ctx,
                            step="tiktok", key=args.slug, json_schema=TIKTOK_SCHEMA,
                            effort="medium", max_tokens=4000)
    tk = json.loads(tk_txt)
    print(f"  ✓ TikTok: hook=“{tk['hook_tela']}” · {len(tk['roteiro_beats'])} beats")

    # 3) Empacotador → YouTube Shorts
    yt_txt, _ = claude.call(model=SONNET, system=YT_SYSTEM, user=ctx,
                            step="youtube", key=args.slug, json_schema=YT_SCHEMA,
                            effort="low", max_tokens=1500)
    yt = json.loads(yt_txt)
    print(f"  ✓ YouTube: “{yt['titulo'][:60]}”")

    platforms = {"instagram": ig, "tiktok": tk, "youtube": yt}
    (out / "platforms.json").write_text(json.dumps(platforms, ensure_ascii=False, indent=2), encoding="utf-8")

    # 4) Arte estruturada (Diretor → IA+QC → headline coerente → card, ou frame próprio)
    art_res = None
    if not args.no_art and ig.get("headline_capa"):
        try:
            art_res = art.art_for_piece(claude, args.slug, ig["headline_capa"], log)
        except SpendCapExceeded as e:
            print(f"[plataformas] teto de gasto na arte: {e} (peça segue sem story.png)")
        if art_res:
            platforms["arte"] = {"story_png": art_res["story"], "fonte": art_res["source"],
                                 "headline": art_res["headline"],
                                 "story9x16_png": art_res.get("story9x16"),
                                 "credito": art_res.get("credito")}
            (out / "platforms.json").write_text(
                json.dumps(platforms, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[plataformas] OK → {out / 'platforms.json'}"
          f"{' + story.png (' + art_res['source'] + ')' if art_res else ''} · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
