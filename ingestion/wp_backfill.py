"""
ingestion/wp_backfill.py — Etapa 2 do Bootstrap (PRD §14).

Importa TODO o acervo do AlohaBJJNews via WP REST API e grava um "raw store"
determinístico em knowledge/_backfill/. Sem IA, sem chave de API.

Para cada post:
  knowledge/_backfill/<slug>.md    -> frontmatter + texto limpo (para o Analista ler)
  knowledge/_backfill/<slug>.json  -> metadados estruturados

Idempotente: pula post cujo `modified` não mudou desde o último import.
Uso:
    python -m ingestion.wp_backfill                 # usa ALOHA_BASE_URL do .env
    python -m ingestion.wp_backfill --limit 3       # só os 3 primeiros (teste)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# permite `python -m ingestion.wp_backfill` e execução direta
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ingestion.html_clean import clean_html, strip_tags_inline  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "knowledge" / "_backfill"
UA = "BjjcomLucas-backfill/1.0 (+https://alohabjjnews.com)"

# console do Windows costuma ser cp1252; força UTF-8 para não quebrar em prints
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


def fetch_all_posts(base_url: str, per_page: int = 100, limit: int | None = None) -> list[dict]:
    """Pagina /wp-json/wp/v2/posts?_embed=1 até esgotar."""
    posts: list[dict] = []
    page = 1
    session = requests.Session()
    session.headers.update({"User-Agent": UA})
    while True:
        url = f"{base_url.rstrip('/')}/wp-json/wp/v2/posts"
        params = {"per_page": per_page, "page": page, "_embed": "1"}
        r = session.get(url, params=params, timeout=30)
        if r.status_code == 400:
            # WP responde 400 quando `page` passa do total -> fim
            break
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        posts.extend(batch)
        total_pages = int(r.headers.get("X-WP-TotalPages", page))
        if limit and len(posts) >= limit:
            return posts[:limit]
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.3)  # educado com o servidor
    return posts[:limit] if limit else posts


def _terms(post: dict, taxonomy: str) -> list[str]:
    """Extrai nomes de termos (category/post_tag) do bloco _embedded."""
    names: list[str] = []
    for group in post.get("_embedded", {}).get("wp:term", []) or []:
        for term in group or []:
            if term.get("taxonomy") == taxonomy:
                names.append(term.get("name", ""))
    return [n for n in names if n]


def _featured_image(post: dict) -> str | None:
    media = post.get("_embedded", {}).get("wp:featuredmedia") or []
    if media and isinstance(media, list):
        return media[0].get("source_url")
    return None


def post_to_records(post: dict) -> tuple[dict, str]:
    """Devolve (metadata_dict, markdown_text) para um post."""
    title = strip_tags_inline(post.get("title", {}).get("rendered", ""))
    slug = post.get("slug") or f"post-{post.get('id')}"
    body = clean_html(post.get("content", {}).get("rendered", ""))
    excerpt = strip_tags_inline(post.get("excerpt", {}).get("rendered", ""))

    meta = {
        "id": post.get("id"),
        "slug": slug,
        "title": title,
        "date": post.get("date"),
        "modified": post.get("modified"),
        "link": post.get("link"),
        "categories": _terms(post, "category"),
        "tags": _terms(post, "post_tag"),
        "featured_image": _featured_image(post),
        "excerpt": excerpt,
        "source": "alohabjjnews",
        "lang": "pt-BR",
    }

    # frontmatter em YAML (valores JSON são YAML válido) + corpo
    fm_lines = ["---"]
    for k in ("id", "slug", "title", "date", "modified", "link",
              "categories", "tags", "featured_image", "source", "lang"):
        fm_lines.append(f"{k}: {json.dumps(meta[k], ensure_ascii=False)}")
    fm_lines.append("---\n")
    md = "\n".join(fm_lines) + f"# {title}\n\n{body}\n"
    return meta, md


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("ALOHA_BASE_URL", "https://alohabjjnews.com"))
    parser.add_argument("--limit", type=int, default=None, help="limita nº de posts (teste)")
    parser.add_argument("--force", action="store_true", help="reimporta mesmo sem mudança")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    log = JobLog(prefix="backfill")
    print(f"[backfill] run_id={log.run_id}  fonte={args.base_url}")

    t0 = time.time()
    posts = fetch_all_posts(args.base_url, limit=args.limit)
    print(f"[backfill] {len(posts)} posts recebidos da WP REST API")

    written, skipped = 0, 0
    for post in posts:
        meta, md = post_to_records(post)
        slug = meta["slug"]
        json_path = OUT_DIR / f"{slug}.json"
        md_path = OUT_DIR / f"{slug}.md"

        # idempotência: pula se o `modified` não mudou
        if not args.force and json_path.exists():
            try:
                prev = json.loads(json_path.read_text(encoding="utf-8"))
                if prev.get("modified") == meta["modified"]:
                    skipped += 1
                    log.record("backfill_post", "succeeded", key=slug, note="unchanged")
                    continue
            except (json.JSONDecodeError, OSError):
                pass

        json_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        md_path.write_text(md, encoding="utf-8")
        written += 1
        log.record("backfill_post", "succeeded", key=slug,
                   note=f"chars={len(md)}", cats=",".join(meta["categories"]))
        print(f"  ✓ {slug}  ({len(meta['categories'])} cat, {len(md)} chars)")

    dt = round(time.time() - t0, 1)
    log.record("backfill_run", "succeeded", note=f"written={written} skipped={skipped}", t0=t0, t1=time.time())
    print(f"\n[backfill] OK — gravados={written} pulados={skipped} em {dt}s → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
