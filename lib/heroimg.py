"""
lib/heroimg.py — Hero da arte (híbrido): foto REAL do artigo-fonte, IA como fallback.

Estratégia (decisão do Lucas, 16/07/2026):
  1) tenta a imagem do próprio artigo (og:image / twitter:image / <img> grande);
  2) se não achar nada usável, cai para geração por IA (lib.imagegen, se houver chave).

Registra a procedência (URL da imagem + domínio) pra crédito na arte e no meta (uso responsável).
Determinístico e sem IA no caminho feliz.
"""
from __future__ import annotations

import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; AlohaBJJBot/1.0; +https://alohabjjnews.com)"
_OG = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::url)?|twitter:image)["\'][^>]*>',
    re.I)
_CONTENT = re.compile(r'content=["\']([^"\']+)["\']', re.I)


def _get(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def og_image(page_url: str) -> str | None:
    """Extrai a URL da imagem social (og:image/twitter:image) de um artigo."""
    try:
        html = _get(page_url).decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return None
    for tag in _OG.findall(html):
        m = _CONTENT.search(tag)
        if m:
            return urljoin(page_url, m.group(1).strip())
    return None


def download(img_url: str, dest: Path, min_bytes: int = 12000) -> Path | None:
    """Baixa a imagem; rejeita coisas pequenas demais (ícones/placeholder)."""
    try:
        data = _get(img_url)
    except Exception:  # noqa: BLE001
        return None
    if len(data) < min_bytes:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def hero_for(sources: list[str], dest: Path) -> dict | None:
    """
    Dado uma lista de URLs de artigo, devolve o 1º hero real utilizável:
      {"path": Path, "img_url": str, "credito": "flograppling.com"}
    ou None (aí o chamador usa o fallback de IA).
    """
    for src in sources:
        if not src or not src.startswith("http"):
            continue
        img = og_image(src)
        if not img:
            continue
        got = download(img, dest)
        if got:
            return {"path": got, "img_url": img, "credito": urlparse(src).netloc.replace("www.", "")}
    return None


if __name__ == "__main__":  # teste rápido
    import sys
    srcs = sys.argv[1:]
    out = Path("outputs/_herotest/hero.jpg")
    r = hero_for(srcs, out)
    print(r or "nenhuma imagem real encontrada")
