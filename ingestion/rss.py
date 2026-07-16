"""
ingestion/rss.py — Ingestão de RSS ao vivo (camada de dados do Radar).

Lê config/fontes.yaml, coleta os feeds (campo `rss` + feeds de YouTube via
`channel_id`), busca entradas novas e deduplica por URL contra um seen-log.
Determinístico e grátis (não usa IA).

Regra (§5): web/RSS/YouTube = FONTE. Instagram/TikTok nunca entram aqui.

Uso:
    python -m ingestion.rss                 # busca e mostra pautas novas
    python -m ingestion.rss --limit 20
    python -m ingestion.rss --reset         # zera o seen-log (reprocessa tudo)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import feedparser
from ruamel.yaml import YAML

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_yaml = YAML(typ="safe", pure=True)

ROOT = Path(__file__).resolve().parent.parent
FONTES = ROOT / "config" / "fontes.yaml"
SEEN = ROOT / "ingestion" / ".seen_urls.json"
YT_RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={cid}"

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


def _walk(node):
    """Percorre o YAML e devolve todo dict com informação de fonte."""
    if isinstance(node, dict):
        if "name" in node and ("rss" in node or "channel_id" in node or "url" in node):
            yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def feeds_from_fontes() -> list[dict]:
    """Lista de {name, feed_url, category, priority} com feed RSS resolvível."""
    data = _yaml.load(FONTES.read_text(encoding="utf-8"))
    feeds = []
    for src in _walk(data):
        feed_url = None
        if src.get("rss"):
            feed_url = src["rss"]
        elif src.get("channel_id"):
            feed_url = YT_RSS.format(cid=src["channel_id"])
        if not feed_url:
            continue
        feeds.append({
            "name": src.get("name", "?"),
            "feed_url": feed_url,
            "category": src.get("category", "news"),
            "priority": src.get("priority", 2),
            "lang": src.get("lang", "en"),
        })
    return feeds


def _load_seen() -> set[str]:
    if SEEN.exists():
        try:
            return set(json.loads(SEEN.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            return set()
    return set()


def _save_seen(seen: set[str]) -> None:
    SEEN.write_text(json.dumps(sorted(seen), ensure_ascii=False, indent=0), encoding="utf-8")


def mark_urls_seen(urls) -> int:
    """Marca URLs específicas como vistas (chamado APÓS resolver a pauta,
    não na busca — assim uma falha não 'come' a pauta e ela é re-tentada)."""
    urls = [u for u in urls if u]
    if not urls:
        return 0
    seen = _load_seen()
    n0 = len(seen)
    seen.update(urls)
    _save_seen(seen)
    return len(seen) - n0


def fetch_new_items(limit: int | None = None, mark_seen: bool = True) -> list[dict]:
    """Busca entradas novas de todos os feeds. Deduplica por URL."""
    seen = _load_seen()
    feeds = feeds_from_fontes()
    items: list[dict] = []
    for f in feeds:
        try:
            parsed = feedparser.parse(f["feed_url"])
        except Exception as e:  # noqa: BLE001
            print(f"  ! {f['name']}: erro ao ler feed ({e})")
            continue
        got = 0
        for e in parsed.entries:
            url = getattr(e, "link", None)
            if not url or url in seen:
                continue
            seen.add(url)
            pub = getattr(e, "published", "") or getattr(e, "updated", "")
            items.append({
                "titulo": getattr(e, "title", "").strip(),
                "url": url,
                "publicado": pub,
                "resumo": (getattr(e, "summary", "") or "")[:400],
                "fonte": f["name"],
                "categoria": f["category"],
                "priority": f["priority"],
                "lang": f["lang"],
            })
            got += 1
        status = "ok" if not parsed.get("bozo") else "parcial"
        print(f"  · {f['name']}: {got} novas ({status})")
    # prioridade 1 primeiro, depois por ordem de chegada
    items.sort(key=lambda x: x["priority"])
    if limit:
        items = items[:limit]
    if mark_seen:
        _save_seen(seen)
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--no-mark", action="store_true", help="não grava o seen-log (teste)")
    args = ap.parse_args()

    if args.reset and SEEN.exists():
        SEEN.unlink()
        print("[rss] seen-log zerado.")

    t0 = time.time()
    print("[rss] lendo feeds das fontes (RSS + YouTube)…")
    items = fetch_new_items(limit=args.limit, mark_seen=not args.no_mark)
    print(f"\n[rss] {len(items)} pautas novas em {round(time.time()-t0,1)}s\n")
    for it in items[:30]:
        print(f"  [{it['fonte']}·p{it['priority']}] {it['titulo']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
