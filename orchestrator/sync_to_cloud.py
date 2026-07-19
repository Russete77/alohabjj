"""
orchestrator/sync_to_cloud.py — publica o conteúdo pro DEPLOY.

O admin/portal local lêem o DISCO. No Vercel o disco não vai junto — então este script
sobe pro Supabase Storage (bucket público `art`):
  • as imagens (hero dos dossiês, slides e arte das peças), e
  • dois snapshots JSON já no formato que o site renderiza:
        art/data/dossiers.json   (lista de dossiês)
        art/data/pieces.json     (peças + pacotes por plataforma)

O site lê DISCO primeiro (local, sem mudança) e cai nesses snapshots quando o disco não
existe (deploy). Assim "os dois" — portal público e admin — funcionam no ar, com imagem.

As tabelas normalizadas (dossiers/pieces/products) seguem sendo escritas pelo pipeline
(índice/loja/analytics); este snapshot é só a camada de RENDER (rápida e barata de servir).

Uso:
    python -m orchestrator.sync_to_cloud            # tudo
    python -m orchestrator.sync_to_cloud --slug <slug>   # só uma peça/dossiê
    python -m orchestrator.sync_to_cloud --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import storage  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"
BACKFILL = KNOWLEDGE / "_backfill"
OUTPUTS = ROOT / "outputs"
HERO = ROOT / "web" / "public" / "hero"
BUCKET = "art"

LABEL = {"superlutas": "Superlutas", "noticias": "Notícias",
         "analises": "Análises", "tecnica": "Técnica"}


def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _map_categoria(wp_cats: list[str], atletas: list[str]) -> str:
    c = [x.lower() for x in (wp_cats or [])]
    if any("superluta" in x for x in c):
        return "superlutas"
    if any("news" in x or "not" in x for x in c):
        return "noticias"
    if any("anál" in x or "anal" in x for x in c):
        return "analises"
    return "tecnica" if not atletas else "superlutas"


def _parse_summary(md: str) -> list[str]:
    import re
    body = re.sub(r"^#[^\n]*\n+", "", md)
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n{2,}", body) if p.strip()]


def build_dossiers(dry: bool, only: str | None) -> dict:
    """Devolve {slug: dossier_dict} no shape que web/lib/dossiers.ts produz."""
    out: dict = {}
    if not KNOWLEDGE.exists():
        return out
    for dir in sorted(KNOWLEDGE.iterdir()):
        if not dir.is_dir() or dir.name in ("_backfill", "atletas", "sources"):
            continue
        slug = dir.name
        if only and slug != only:
            continue
        meta = _read_json(dir / "metadata.json")
        summ_p = dir / "summary.md"
        if not meta or not summ_p.exists():
            continue
        back = _read_json(BACKFILL / f"{slug}.json")
        summary = summ_p.read_text(encoding="utf-8")
        titulo = back.get("title") or (summary.splitlines()[0].lstrip("# ").strip()
                                       if summary.startswith("#") else slug.replace("-", " "))
        atletas = meta.get("atletas") or []
        categoria = _map_categoria(back.get("categories") or [], atletas)
        # imagem: sobe o hero pro Storage (deploy); local segue usando /hero/ via disco
        imagem = meta.get("imagem") or back.get("featured_image")
        hero_file = HERO / f"{slug}.jpg"
        if hero_file.exists() and not dry:
            url = storage.upload(BUCKET, f"hero/{slug}.jpg", hero_file)
            if url:
                imagem = url
        out[slug] = {
            "slug": slug, "titulo": titulo, "categoria": categoria,
            "categoriaLabel": LABEL[categoria], "atletas": atletas,
            "evento": meta.get("evento") or "", "data": (meta.get("data") or back.get("date") or "")[:10],
            "resumoParas": _parse_summary(summary),
            "imagem": imagem, "fonteUrl": meta.get("source_url") or back.get("link"),
            "confianca": meta.get("confianca") or "media", "tags": meta.get("tags") or [],
        }
    return out


def build_pieces(dossiers: dict, dry: bool, only: str | None) -> list:
    """Devolve [piece_dict] no shape de web/lib/pieces.ts (com imagens já em Storage)."""
    pieces: list = []
    if not OUTPUTS.exists():
        return pieces
    for dir in sorted(OUTPUTS.iterdir()):
        if not dir.is_dir():
            continue
        slug = dir.name
        if only and slug != only:
            continue
        meta = _read_json(dir / "meta.json")
        if not meta:
            continue
        slides = _read_json(dir / "slides.json") or []
        cap_p = dir / "caption.txt"
        caption = cap_p.read_text(encoding="utf-8") if cap_p.exists() else ""
        platforms = _read_json(dir / "platforms.json") or None
        dossier = dossiers.get(slug, {})
        # sobe as artes e guarda a URL pública (deploy). Local usa /api/art via disco.
        slide_urls: list = []
        for f in sorted(dir.glob("slide-*.png")):
            u = storage.upload(BUCKET, f"{slug}/{f.name}", f) if not dry else None
            slide_urls.append(u or f.name)
        story_url = None
        story_f = dir / "story.png"
        if story_f.exists():
            story_url = (storage.upload(BUCKET, f"{slug}/story.png", story_f) if not dry else None) or "story.png"
        pieces.append({
            "slug": slug, "titulo": dossier.get("titulo") or slug,
            "categoria": dossier.get("categoria") or "superlutas",
            "categoriaLabel": dossier.get("categoriaLabel") or "Superlutas",
            "formato": meta.get("formato") or "carrossel", "produto_id": meta.get("produto_id") or "curso",
            "cta": meta.get("cta") or "", "estado": meta.get("estado") or "gerado",
            "nota": (meta.get("quality") or {}).get("nota"), "disclosure": meta.get("disclosure"),
            "hero": bool(meta.get("hero")), "slides": slides,
            "slidePngs": slide_urls, "storyPng": story_url, "caption": caption, "platforms": platforms,
        })
    return pieces


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="publica só este slug")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not storage.enabled():
        print("[sync] Storage desabilitado (faltam SUPABASE_URL/SERVICE_ROLE_KEY)."); return 1

    dossiers = build_dossiers(args.dry_run, args.slug)
    pieces = build_pieces(dossiers, args.dry_run, args.slug)
    print(f"[sync] {len(dossiers)} dossiê(s) · {len(pieces)} peça(s)"
          f"{' · DRY (nada subiu)' if args.dry_run else ''}")

    if args.dry_run:
        return 0

    # snapshots JSON — quando --slug, faz merge com o snapshot já publicado (não apaga o resto)
    import urllib.request
    def _fetch(name: str) -> dict | list:
        try:
            u = storage.public_url(BUCKET, f"data/{name}")
            return json.loads(urllib.request.urlopen(u, timeout=15).read())
        except Exception:  # noqa: BLE001
            return {} if name == "dossiers.json" else []

    if args.slug:
        base_d = _fetch("dossiers.json"); base_d.update(dossiers); dossiers = base_d
        base_p = {p["slug"]: p for p in _fetch("pieces.json")}  # type: ignore
        for p in pieces:
            base_p[p["slug"]] = p
        pieces = list(base_p.values())

    tmp = ROOT / "jobs"
    tmp.mkdir(exist_ok=True)
    for name, data in (("dossiers.json", dossiers), ("pieces.json", pieces)):
        f = tmp / f"_snap_{name}"
        f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        url = storage.upload(BUCKET, f"data/{name}", f)
        f.unlink(missing_ok=True)
        print(f"  ✓ {name}: {url or 'FALHOU'}")

    print("[sync] pronto — o deploy já lê daqui quando o disco não existe.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
