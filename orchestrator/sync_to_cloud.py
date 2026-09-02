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
from lib.dossier_index import read_all  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
HERO = ROOT / "web" / "public" / "hero"
BUCKET = "art"



def _read_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}




def publicados_do_banco() -> set[str] | None:
    """Slugs com status='published'. None quando o banco não responde.

    None e set() são tratados igual lá na frente (nada vai ao ar) — a distinção
    existe só pra mensagem de log ser honesta sobre o motivo.
    """
    import os
    import urllib.request
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not (url and key):
        return None
    req = urllib.request.Request(
        f"{url}/rest/v1/dossiers?select=slug&status=eq.published&arquivado=is.false",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {row["slug"] for row in json.loads(r.read())}
    except Exception:  # noqa: BLE001
        return None


def filtrar_publicados(todos: list[dict], publicados: set[str] | None) -> dict:
    """Só o que o operador promoveu entra no snapshot. Falha FECHADO."""
    if not publicados:
        return {}
    return {d["slug"]: d for d in todos if d["slug"] in publicados}


def build_dossiers(dry: bool, only: str | None) -> dict:
    """{slug: dossier} — só os publicados, com o hero já no Storage."""
    pub = publicados_do_banco()
    if pub is None:
        print("[sync] AVISO: banco não respondeu — snapshot sai VAZIO (falha fechada).")
    todos = read_all()
    if only:
        todos = [d for d in todos if d["slug"] == only]
    out = filtrar_publicados(todos, pub)
    print(f"[sync] {len(todos)} no disco · {len(out)} publicado(s) vão ao ar")

    for slug, d in out.items():
        hero_file = HERO / f"{slug}.jpg"
        if hero_file.exists() and not dry:
            u = storage.upload(BUCKET, f"hero/{slug}.jpg", hero_file)
            if u:
                d["imagem"] = u
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
        # Merge com o snapshot já publicado — MAS podando o que não está mais
        # publicado. Sem a poda, republicar uma peça preservaria para sempre o
        # que o snapshot antigo carregava (hoje, os 52 de antes do porteiro).
        pub = publicados_do_banco() or set()
        base_d = {k: v for k, v in _fetch("dossiers.json").items() if k in pub}  # type: ignore
        base_d.update(dossiers)
        dossiers = base_d
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
