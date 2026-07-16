"""
orchestrator/build_platforms.py — Empacota uma peça aprovada por plataforma + arte.

Roda, sobre outputs/<slug>/ (slides + caption + meta):
  - Instagram Publisher (Sonnet) → legenda BR + EUA, palavras-chave, headlines topo/capa
  - TikTok Publisher   (Sonnet) → pacote viral nativo (hook, beats, loop, CTA)
  - Empacotador        (Sonnet) → YouTube Shorts (título, descrição, tags)
  - Render (node/sharp) → outputs/<slug>/story.png (frame AlohaBJJ + headline_capa[0])

Grava outputs/<slug>/platforms.json (instagram, tiktok, youtube) + story.png.

Requer ANTHROPIC_API_KEY.
Uso:
    python -m orchestrator.build_platforms <slug>
    python -m orchestrator.build_platforms <slug> --dry-run
    python -m orchestrator.build_platforms <slug> --no-art   # pula o render
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, HAIKU  # noqa: E402
from lib.jobs import JobLog  # noqa: E402
from lib import heroimg  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
KNOWLEDGE = ROOT / "knowledge"
AGENTS = ROOT / "agents"
LUCAS = ROOT / "web" / "public" / "templates" / "lucas.png"  # recorte do apresentador (opcional)

_URL = re.compile(r"https?://[^\s)\]\"']+")


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


def _sources(slug: str) -> list[str]:
    """URLs de artigo do dossiê (metadata + facts) pra buscar a foto real."""
    d = KNOWLEDGE / slug
    urls: list[str] = []
    meta_p = d / "metadata.json"
    if meta_p.exists():
        try:
            m = json.loads(meta_p.read_text(encoding="utf-8"))
            link = (m.get("source") or {}).get("link") if isinstance(m.get("source"), dict) else m.get("source")
            if isinstance(link, str):
                urls.append(link)
        except Exception:  # noqa: BLE001
            pass
    facts_p = d / "facts.md"
    if facts_p.exists():
        urls += _URL.findall(facts_p.read_text(encoding="utf-8"))
    # dedup preservando ordem
    seen, out = set(), []
    for u in urls:
        u = u.rstrip(".,;")
        if u not in seen:
            seen.add(u); out.append(u)
    return out


COHERENCE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"ve_na_foto": {"type": "string"}, "headline": {"type": "string"},
                   "veio_das_opcoes": {"type": "boolean"}},
    "required": ["ve_na_foto", "headline", "veio_das_opcoes"],
}
COHERENCE_SYS = (
    "Você é o Editor de Capa da AlohaBJJ. Regra inegociável: a headline NUNCA pode afirmar algo "
    "que a FOTO não mostra — não cite pessoa específica, sexo, resultado ou número que não dá pra "
    "ver na imagem. Coerência imagem↔texto acima de tudo (evita o vexame de 'campeã' sobre foto de homens)."
)


def coherent_headline(claude: Claude, image_path: Path, headlines: list[str], contexto: str,
                      slug: str) -> str:
    """Claude OLHA a foto e escolhe/escreve a headline honesta com o que aparece."""
    user = ("Esta é a FOTO que vai virar a arte do card. Escolha, entre as OPÇÕES, a headline mais "
            "forte que seja HONESTA com o que aparece na foto. Se NENHUMA for honesta (a foto não "
            "mostra a pessoa/cena citada), ESCREVA você uma headline curta, verdadeira e chamativa "
            "para o que a imagem realmente mostra (máx. 6 palavras). Devolva também o que você vê.\n\n"
            f"OPÇÕES:\n- " + "\n- ".join(headlines) + f"\n\nCONTEXTO (tema da matéria): {contexto[:400]}")
    try:
        txt, _ = claude.call(model=HAIKU, system=COHERENCE_SYS, user=user, image=str(image_path),
                             step="capa_visao", key=slug, json_schema=COHERENCE_SCHEMA, max_tokens=500)
        r = json.loads(txt)
        print(f"  👁  visão: “{r['ve_na_foto'][:70]}” → headline {'(opção)' if r['veio_das_opcoes'] else '(reescrita)'}")
        return r["headline"]
    except Exception as e:  # noqa: BLE001
        print(f"  · visão falhou ({e}); usando a 1ª headline")
        return headlines[0]


def render_card(slug: str, headlines: list[str], contexto: str, claude: Claude, log: JobLog) -> dict | None:
    """Foto REAL do artigo (heroimg, híbrido) + headline coerente (visão) → outputs/<slug>/story.png."""
    out_dir = OUTPUTS / slug
    hero = heroimg.hero_for(_sources(slug), out_dir / "hero_src.jpg")
    credito = None
    hero_path = None
    if hero:
        hero_path = hero["path"]; credito = hero["credito"]
        print(f"  ✓ foto real: {credito} ({hero['img_url'][:60]}…)")
    else:
        # fallback IA (só se houver chave de imagem configurada)
        try:
            from lib.imagegen import which
            if which() != "nenhum (sem chave)":
                print(f"  · sem foto na fonte — fallback de IA ({which()}) [pendente de wiring]")
        except Exception:  # noqa: BLE001
            pass
        print("  · sem foto real utilizável e sem IA — card sem hero pulado")
        return None

    # portão de coerência: o Claude olha a foto e garante headline honesta com a imagem
    headline = coherent_headline(claude, hero_path, headlines, contexto, slug)

    out_png = out_dir / "story.png"
    cmd = ["node", "scripts/render_card.mjs", "--hero", str(hero_path),
           "--headline", headline, "--out", str(out_png)]
    if credito:
        cmd += ["--credito", credito]
    if LUCAS.exists():
        cmd += ["--lucas", str(LUCAS)]
    try:
        r = subprocess.run(cmd, cwd=str(ROOT / "web"), capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            print(f"  ! card falhou: {r.stderr.strip() or r.stdout.strip()}")
            log.record("arte", "errored", key=slug, error=(r.stderr or r.stdout)[:200])
            return None
        print(f"  ✓ card: {out_png.name} ← “{headline}”")
        log.record("arte", "succeeded", key=slug)
        return {"path": out_png, "credito": credito, "headline": headline}
    except Exception as e:  # noqa: BLE001
        print(f"  ! card falhou: {e}")
        return None


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-art", action="store_true", help="não renderiza a arte")
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

    # 4) Arte do card (foto real + headline coerente por visão)
    art = None
    if not args.no_art and ig.get("headline_capa"):
        art = render_card(args.slug, ig["headline_capa"], caption, claude, log)
        if art:
            platforms["arte"] = {"story_png": "story.png", "credito_foto": art["credito"],
                                 "headline": art["headline"]}
            (out / "platforms.json").write_text(
                json.dumps(platforms, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[plataformas] OK → {out / 'platforms.json'}"
          f"{' + story.png' if art else ''} · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
