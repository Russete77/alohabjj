"""
orchestrator/build_dossiers.py — Etapa 4 do Bootstrap (PRD §9.1, §7, §8).

Roda o Analista/Opus sobre cada artigo do raw store (knowledge/_backfill/) e grava
um dossiê estruturado PT-BR em knowledge/<slug>/{summary.md, facts.md, angles.md, metadata.json}.

Idempotente/resumível: pula slug já processado (metadata.json existe).
Requer ANTHROPIC_API_KEY (etapa paga).

Uso:
    python -m orchestrator.build_dossiers               # processa todos os pendentes
    python -m orchestrator.build_dossiers --limit 2     # só 2 (teste de custo)
    python -m orchestrator.build_dossiers --dry-run     # lista o que faria, sem chamar a API
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, OPUS, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BACKFILL = ROOT / "knowledge" / "_backfill"
KNOWLEDGE = ROOT / "knowledge"
SYSTEM = (ROOT / "agents" / "analyst" / "system.md").read_text(encoding="utf-8")

# Schema forçado (output_config.format). Restrições de structured outputs:
# additionalProperties:false + required em todos; sem min/maxLength.
DOSSIER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "texto": {"type": "string"},
                    "fonte": {"type": "string"},
                    "status": {"type": "string", "enum": ["fato_confirmado", "nao_confirmado"]},
                },
                "required": ["texto", "fonte", "status"],
            },
        },
        "angles": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "angulo": {"type": "string"},
                    "conversao": {"type": "boolean"},
                },
                "required": ["angulo", "conversao"],
            },
        },
        "atletas": {"type": "array", "items": {"type": "string"}},
        "evento": {"type": "string"},
        "data": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "confianca": {"type": "string", "enum": ["alta", "media", "baixa"]},
        "angulos_usados": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "facts", "angles", "atletas", "evento", "data",
                 "tags", "confianca", "angulos_usados"],
}


def _try_stdout_utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


def portal_image(url: str | None, slug: str) -> str | None:
    """Baixa a og:image do artigo-fonte pro portal (grátis, sem IA) e devolve o caminho
    servível /hero/<slug>.jpg. Sem imagem → None (portal usa o degradê)."""
    if not url:
        return None
    try:
        from lib import heroimg
        og = heroimg.og_image(url)
        if not og:
            return None
        hero_dir = KNOWLEDGE.parent / "web" / "public" / "hero"
        hero_dir.mkdir(parents=True, exist_ok=True)
        got = heroimg.download(og, hero_dir / f"{slug}.jpg")
        return f"/hero/{slug}.jpg" if got else None
    except Exception:  # noqa: BLE001
        return None


def write_dossier(slug: str, src_meta: dict, d: dict) -> None:
    out = KNOWLEDGE / slug
    out.mkdir(parents=True, exist_ok=True)

    (out / "summary.md").write_text(f"# {src_meta['title']}\n\n{d['summary']}\n", encoding="utf-8")

    facts_md = ["# Fatos\n"]
    for f in d["facts"]:
        facts_md.append(f"- [{f['status']}] {f['texto']}  \n  _fonte: {f['fonte']}_")
    (out / "facts.md").write_text("\n".join(facts_md) + "\n", encoding="utf-8")

    angles_md = ["# Ângulos\n"]
    for a in d["angles"]:
        tag = " **(conversão)**" if a.get("conversao") else ""
        angles_md.append(f"- {a['angulo']}{tag}")
    (out / "angles.md").write_text("\n".join(angles_md) + "\n", encoding="utf-8")

    metadata = {
        "slug": slug,
        "tags": d["tags"],
        "atletas": d["atletas"],
        "evento": d["evento"],
        "data": d["data"] or src_meta.get("date", ""),
        "confianca": d["confianca"],
        "angulos_usados": d["angulos_usados"],
        "embedding_ref": None,          # dedupe por embedding vem em fase futura
        "source_url": src_meta.get("link"),
        "imagem": portal_image(src_meta.get("link"), slug),   # foto real do artigo → portal
        "source": "alohabjjnews-backfill",
    }
    (out / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    # dual-write best-effort no Supabase (no-op sem credencial)
    try:
        from lib import db
        db.upsert_dossier({
            "slug": slug, "titulo": src_meta.get("title"), "evento": d.get("evento"),
            "data": (d.get("data") or src_meta.get("date")) or None, "confianca": d.get("confianca"),
            "source_url": src_meta.get("link"), "source": metadata["source"],
            "resumo": d.get("summary"), "artifact_path": f"knowledge/{slug}/", "status": "validated",
        })
    except Exception:  # noqa: BLE001
        pass


def main() -> int:
    _try_stdout_utf8()
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--effort", default="high")
    args = parser.parse_args()

    jsons = sorted(BACKFILL.glob("*.json"))
    if not jsons:
        raise SystemExit("Nenhum arquivo em knowledge/_backfill/. Rode ingestion.wp_backfill primeiro.")

    pending = []
    for jf in jsons:
        slug = jf.stem
        if (KNOWLEDGE / slug / "metadata.json").exists():
            continue  # já processado (idempotência)
        pending.append(jf)
    if args.limit:
        pending = pending[: args.limit]

    print(f"[dossies] {len(jsons)} no raw store, {len(pending)} pendentes"
          + (f" (limitado a {args.limit})" if args.limit else ""))

    if args.dry_run:
        for jf in pending:
            print(f"  faria: {jf.stem}")
        print("[dossies] --dry-run: NENHUMA chamada à API foi feita.")
        return 0

    log = JobLog(prefix="dossies")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[dossies] {e}")
        return 1
    print(f"[dossies] run_id={log.run_id} — {OPUS.id} (effort={args.effort})")

    ok, failed = 0, 0
    for jf in pending:
        slug = jf.stem
        src_meta = json.loads(jf.read_text(encoding="utf-8"))
        body = (BACKFILL / f"{slug}.md").read_text(encoding="utf-8").split("---", 2)[-1].strip()
        user = f"Artigo de origem (AlohaBJJNews):\n\nTÍTULO: {src_meta['title']}\nURL: {src_meta.get('link')}\n\n{body}"
        try:
            text, usage = claude.call(
                model=OPUS, system=SYSTEM, user=user,
                step="build_dossier", key=slug, max_tokens=6000,
                effort=args.effort, json_schema=DOSSIER_SCHEMA,
            )
            d = json.loads(text)
            write_dossier(slug, src_meta, d)
            ok += 1
            print(f"  ✓ {slug}  (in={usage['in_tok']} out={usage['out_tok']} ${usage['cost']:.4f})")
        except SpendCapExceeded as e:
            print(f"\n[dossies] PARADO: {e}")
            break
        except (json.JSONDecodeError, KeyError, RuntimeError) as e:
            failed += 1
            log.record("build_dossier", "errored", key=slug, error=str(e))
            print(f"  ! {slug}: {e}")

    print(f"\n[dossies] OK={ok} falhas={failed} | custo total do run ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
