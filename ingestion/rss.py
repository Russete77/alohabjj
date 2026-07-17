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
import calendar
import json
import os
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


DEFAULT_MAX_AGE_DAYS = 21


def _max_age_days() -> int:
    """Janela de recência: env RADAR_MAX_AGE_DAYS > meta.max_age_days do fontes.yaml > 21.
    É o que garante conteúdo RECENTE (corta pauta velha antes de gastar IA)."""
    env = os.getenv("RADAR_MAX_AGE_DAYS")
    if env and env.isdigit():
        return int(env)
    try:
        data = _yaml.load(FONTES.read_text(encoding="utf-8"))
        v = (data or {}).get("meta", {}).get("max_age_days")
        if isinstance(v, int) and v > 0:
            return v
    except Exception:  # noqa: BLE001
        pass
    return DEFAULT_MAX_AGE_DAYS


def _entry_epoch(e) -> float | None:
    """Data de publicação da entrada em epoch (UTC). None se o feed não informar."""
    for attr in ("published_parsed", "updated_parsed"):
        st = getattr(e, attr, None)
        if st:
            try:
                return calendar.timegm(st)
            except Exception:  # noqa: BLE001
                pass
    return None


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


def fetch_new_items(limit: int | None = None, mark_seen: bool = True,
                    max_age_days: int | None = None) -> list[dict]:
    """Busca entradas novas de todos os feeds. Deduplica por URL, CORTA o que for
    mais velho que a janela de recência e ORDENA do mais novo pro mais velho."""
    seen = _load_seen()
    feeds = feeds_from_fontes()
    days = max_age_days if max_age_days is not None else _max_age_days()
    cutoff = time.time() - days * 86400
    items: list[dict] = []
    stale = 0
    for f in feeds:
        try:
            parsed = feedparser.parse(f["feed_url"])
        except Exception as e:  # noqa: BLE001
            print(f"  ! {f['name']}: erro ao ler feed ({e})")
            continue
        got, old = 0, 0
        for e in parsed.entries:
            url = getattr(e, "link", None)
            if not url or url in seen:
                continue
            ts = _entry_epoch(e)
            if ts is not None and ts < cutoff:  # data conhecida e velha → descarta
                old += 1
                continue
            seen.add(url)
            pub = getattr(e, "published", "") or getattr(e, "updated", "")
            items.append({
                "titulo": getattr(e, "title", "").strip(),
                "url": url,
                "publicado": pub,
                "ts": ts or 0.0,
                "resumo": (getattr(e, "summary", "") or "")[:400],
                "fonte": f["name"],
                "categoria": f["category"],
                "priority": f["priority"],
                "lang": f["lang"],
            })
            got += 1
        stale += old
        status = "ok" if not parsed.get("bozo") else "parcial"
        print(f"  · {f['name']}: {got} novas{f' (−{old} velhas)' if old else ''} ({status})")
    # MAIS NOVO primeiro; prioridade da fonte como desempate. Sem data (ts=0) vai pro fim.
    items.sort(key=lambda x: (-x["ts"], x["priority"]))
    print(f"  ⏱ janela de recência: {days} dias · {stale} pautas velhas cortadas")
    if limit:
        items = items[:limit]
    if mark_seen:
        _save_seen(seen)
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--days", type=int, default=None, help="janela de recência (default: fontes.yaml)")
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--no-mark", action="store_true", help="não grava o seen-log (teste)")
    args = ap.parse_args()

    if args.reset and SEEN.exists():
        SEEN.unlink()
        print("[rss] seen-log zerado.")

    t0 = time.time()
    print("[rss] lendo feeds das fontes (RSS + YouTube)…")
    items = fetch_new_items(limit=args.limit, mark_seen=not args.no_mark, max_age_days=args.days)
    print(f"\n[rss] {len(items)} pautas novas em {round(time.time()-t0,1)}s\n")
    for it in items[:30]:
        print(f"  [{it['fonte']}·p{it['priority']}] {it['titulo']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
