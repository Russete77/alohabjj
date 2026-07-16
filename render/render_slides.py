"""
render/render_slides.py — Slides do carrossel: HTML -> PNG (Playwright).

Preenche o template da marca (render/template.html) com o conteúdo de
outputs/<slug>/slides.json e rasteriza cada slide em 1080x1350 (4:5).
Se houver outputs/<slug>/hero.png (imagem complexa da IA), usa como fundo.

Setup (uma vez):
    pip install playwright && python -m playwright install chromium

Uso:
    python -m render.render_slides <slug>
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
TEMPLATE = (ROOT / "render" / "template.html").read_text(encoding="utf-8")
SIGN = "O Jiu-Jitsu está evoluindo. E nós documentamos cada capítulo."


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slide_html(slide: dict, idx: int, total: int, hero_b64: str | None) -> str:
    strip = "".join(f'<i class="{"on" if i <= idx else ""}"></i>' for i in range(total))
    cta = f'<div class="cta">{_esc(slide["corpo"] if slide["cta"] else "")}</div>' if slide["cta"] else ""
    body_p = "" if slide["cta"] else f'{_esc(slide["corpo"])}'
    hero_bg = f",url(data:image/png;base64,{hero_b64})" if hero_b64 and idx == 0 else ""
    return (TEMPLATE
            .replace("{{HERO_BG}}", hero_bg)
            .replace("{{KICKER}}", _esc(slide["kicker"]))
            .replace("{{TITULO}}", _esc(slide["titulo"]))
            .replace("{{CORPO}}", body_p)
            .replace("{{CTA}}", cta)
            .replace("{{SIGN}}", SIGN if idx == total - 1 else "")
            .replace("{{STRIP}}", strip))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    args = ap.parse_args()

    out = OUTPUTS / args.slug
    slides = json.loads((out / "slides.json").read_text(encoding="utf-8"))
    hero = out / "hero.png"
    hero_b64 = base64.b64encode(hero.read_bytes()).decode() if hero.exists() else None

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright não instalado. Rode: pip install playwright && python -m playwright install chromium")
        return 1

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1350})
        for i, s in enumerate(slides):
            page.set_content(slide_html(s, i, len(slides), hero_b64))
            dst = out / f"slide-{i + 1:02d}.png"
            page.screenshot(path=str(dst))
            print(f"  ✓ {dst.name}")
        browser.close()
    print(f"[render] OK — {len(slides)} slides → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
