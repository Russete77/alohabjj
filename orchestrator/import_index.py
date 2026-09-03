"""
orchestrator/import_index.py — popula o índice `dossiers` a partir do disco.

Idempotente (upsert por slug). Existe porque os 52 dossiês foram construídos
ANTES de o Supabase estar configurado, então a tabela nasceu vazia e o portal
passou a servir direto do disco/snapshot, sem porteiro.

NUNCA grava status='published'. Publicar é ato humano, no /admin.

Uso:
    python -m orchestrator.import_index --dry-run
    python -m orchestrator.import_index
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import db, storage  # noqa: E402
from lib.dossier_index import read_all  # noqa: E402
from lib.porteiro import motivo_bloqueio  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HERO = ROOT / "web" / "public" / "hero"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dossies = read_all()
    bloqueados = [d for d in dossies if motivo_bloqueio(d)]
    print(f"[import] {len(dossies)} dossiê(s) no disco · {len(bloqueados)} exigem confirmação ao publicar")
    for d in bloqueados:
        print(f"   ⚠ {d['slug'][:58]} — {motivo_bloqueio(d)}")

    if args.dry_run:
        print("[import] --dry-run: nada gravado.")
        return 0
    if not db.enabled():
        print("[import] Supabase desabilitado (faltam SUPABASE_URL/SERVICE_ROLE_KEY).")
        return 1

    subiu = 0
    for d in dossies:
        # A capa: o banco NÃO pode guardar "/hero/<slug>.jpg". Esse caminho é o
        # disco local — web/public/hero/ está no .gitignore, então as imagens
        # nunca vão pro repositório e na Vercel dão 404. O portal ficava sem
        # imagem nenhuma sem ninguém entender por quê.
        #
        # Sobe pro Storage (idempotente, upsert) e grava a URL pública.
        imagem = d["imagem"]
        if imagem and imagem.startswith("/hero/"):
            arquivo = HERO / imagem.removeprefix("/hero/")
            url = storage.upload("art", f"hero/{arquivo.name}", arquivo) if arquivo.exists() else None
            if url:
                imagem = url
                subiu += 1
            else:
                # Sem o arquivo no disco, a URL do Storage ainda pode existir
                # (de um sync anterior). Melhor apontar pra lá do que pro nada.
                imagem = storage.public_url("art", f"hero/{arquivo.name}")

        db.upsert_dossier({
            "slug": d["slug"],
            "titulo": d["titulo"],
            "categoria": d["categoria"],
            "evento": d["evento"] or None,
            "data": d["data"] or None,
            "confianca": d["confianca"],
            "status": "validated",   # NUNCA published — quem promove é o operador
            "source_url": d["fonteUrl"],
            "source": "import_index",
            "resumo": " ".join(d["resumoParas"])[:2000] or None,
            "imagem": imagem,
            "artifact_path": f"knowledge/{d['slug']}/",
        })
    print(f"[import] {len(dossies)} enfileirado(s) como 'validated' · {subiu} capa(s) subida(s) pro Storage.")
    print("[import] Publicar é no /admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
