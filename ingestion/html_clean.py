"""
ingestion/html_clean.py — HTML (WordPress content.rendered) -> texto limpo.

Usa BeautifulSoup com o parser nativo `html.parser` (sem lxml, evita dor no
Windows). Remove script/style/figure de mídia, preserva parágrafos e títulos,
e normaliza espaços em branco.
"""
from __future__ import annotations

import html
import re

from bs4 import BeautifulSoup

_BLOCK_TAGS = {"p", "div", "section", "article", "br", "li", "tr",
               "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"}


def clean_html(raw: str) -> str:
    """Converte HTML em texto legível preservando quebras de parágrafo."""
    if not raw:
        return ""
    soup = BeautifulSoup(raw, "html.parser")

    # remove ruído não-textual
    for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
        tag.decompose()

    # insere marcadores de quebra para blocos, depois extrai texto
    for tag in soup.find_all(_BLOCK_TAGS):
        tag.append("\n")

    text = soup.get_text()
    text = html.unescape(text)

    # normaliza: no máx. 1 linha em branco entre parágrafos, sem espaços à direita
    lines = [ln.strip() for ln in text.splitlines()]
    out: list[str] = []
    blank = False
    for ln in lines:
        if ln:
            out.append(ln)
            blank = False
        elif not blank:
            out.append("")
            blank = True
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def strip_tags_inline(raw: str) -> str:
    """Versão de 1 linha (para títulos): remove tags e colapsa espaços."""
    if not raw:
        return ""
    text = BeautifulSoup(raw, "html.parser").get_text(" ")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()
