"""
lib/dossier_index.py — leitura normalizada da base em knowledge/.

Um lugar só pra transformar knowledge/<slug>/ num dicionário. Antes isso existia
duplicado no sync_to_cloud e no web/lib/dossiers.ts; o importador precisaria de
uma terceira cópia. Sem I/O de rede — só disco.
"""
from __future__ import annotations

import json
import re
from email.utils import parsedate_to_datetime
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
SERVICO = {"_backfill", "atletas", "sources", "trends"}

LABEL = {
    "superlutas": "Superlutas",
    "noticias": "Notícias",
    "analises": "Análises",
    "tecnica": "Técnica",
}


def infer_categoria(wp_cats: list[str], atletas: list[str]) -> str:
    """Sugestão inicial de editoria a partir da categoria do WordPress.

    ATENÇÃO: é SUGESTÃO, não verdade. A partir da Fase 3 a coluna `categoria`
    do banco vence isto — é justamente este `if` que hoje empilha tudo em
    superlutas sempre que há atleta e o WordPress não deu categoria útil.
    """
    c = [str(x).lower() for x in (wp_cats or [])]
    if any("superluta" in x for x in c):
        return "superlutas"
    if any("news" in x or "not" in x for x in c):
        return "noticias"
    if any("anál" in x or "anal" in x for x in c):
        return "analises"
    return "tecnica" if not atletas else "superlutas"


def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def normaliza_data(raw: str) -> str:
    """Devolve AAAA-MM-DD. Aceita ISO e RFC-822 (o WordPress mistura os dois).

    Cortar os 10 primeiros caracteres — o que se fazia antes — transforma
    "Wed, 22 Apr 2026 11:44:44 +0000" em "Wed, 22 Ap", que ordena ACIMA de
    qualquer data ISO e sequestra o card de destaque da home.
    """
    raw = (raw or "").strip()
    if not raw:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}", raw):
        return raw[:10]
    try:
        return parsedate_to_datetime(raw).date().isoformat()
    except Exception:  # noqa: BLE001
        return ""


def _paragrafos(md: str) -> list[str]:
    body = re.sub(r"^#[^\n]*\n+", "", md)
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n{2,}", body) if p.strip()]


def read_dossier(slug: str, root: Path | None = None) -> dict | None:
    """Um dossiê do disco, normalizado. None quando falta metadata ou summary."""
    base = (root or DEFAULT_ROOT) / "knowledge"
    d = base / slug
    meta = _read_json(d / "metadata.json")
    summ = d / "summary.md"
    if not summ.exists():
        return None

    back = _read_json(base / "_backfill" / f"{slug}.json")
    summary = summ.read_text(encoding="utf-8")
    m = re.match(r"^#\s*(.+)", summary)
    titulo = back.get("title") or (m.group(1).strip() if m else slug.replace("-", " "))
    atletas = meta.get("atletas") or []
    categoria = infer_categoria(back.get("categories") or [], atletas)

    return {
        "slug": slug,
        "titulo": titulo,
        "categoria": categoria,
        "categoriaLabel": LABEL[categoria],
        "atletas": atletas,
        "evento": meta.get("evento") or "",
        "data": normaliza_data(meta.get("data") or back.get("date") or ""),
        "resumoParas": _paragrafos(summary),
        "imagem": meta.get("imagem") or back.get("featured_image"),
        "fonteUrl": meta.get("source_url") or back.get("link"),
        "confianca": meta.get("confianca") or "media",
        "tags": meta.get("tags") or [],
    }


def read_all(root: Path | None = None) -> list[dict]:
    """Todos os dossiês do disco, ordenados por data (mais recente primeiro)."""
    base = (root or DEFAULT_ROOT) / "knowledge"
    if not base.exists():
        return []
    out: list[dict] = []
    for d in sorted(base.iterdir()):
        if not d.is_dir() or d.name in SERVICO:
            continue
        item = read_dossier(d.name, root=root)
        if item:
            out.append(item)
    out.sort(key=lambda x: x["data"], reverse=True)
    return out
