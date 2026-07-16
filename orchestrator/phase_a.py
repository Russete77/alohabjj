"""
orchestrator/phase_a.py — Loop da Fase A (inteligência) ao vivo (PRD §19).

RSS → Radar(relevância) → Dedupe → [tópico novo] Pesquisador → Validador → Analista → dossiê.

Modos:
  --free   : roda só o determinístico (RSS + dedupe) e mostra novo/existe. Sem chave, custo zero.
  (padrão) : roda o pipeline completo — requer ANTHROPIC_API_KEY. Resumível (pula slug já feito).

Uso:
    python -m orchestrator.phase_a --free            # triagem ao vivo, grátis
    python -m orchestrator.phase_a --max 3           # processa até 3 tópicos novos (pago)
    python -m orchestrator.phase_a --max 3 --dry-run # mostra o que faria (pago), sem chamar API
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ingestion.rss import fetch_new_items  # noqa: E402
from lib.claude import Claude, HAIKU, SONNET, OPUS, SpendCapExceeded  # noqa: E402
from lib.embeddings import which as emb_which  # noqa: E402
from lib.jobs import JobLog, already_succeeded  # noqa: E402
from orchestrator.dedupe import base_titles, classify  # noqa: E402
from orchestrator.build_dossiers import DOSSIER_SCHEMA, write_dossier  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"
AGENTS = ROOT / "agents"


def _sys(name: str) -> str:
    return (AGENTS / name / "system.md").read_text(encoding="utf-8")


RADAR_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"relevancia": {"type": "integer"}, "tipo": {"type": "string"},
                   "prioridade": {"type": "string"}},
    "required": ["relevancia", "tipo", "prioridade"],
}
VALIDATOR_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "facts": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"texto": {"type": "string"}, "fontes": {"type": "array", "items": {"type": "string"}},
                           "status": {"type": "string", "enum": ["fato_confirmado", "nao_confirmado"]},
                           "tipo": {"type": "string", "enum": ["fato", "rumor"]}},
            "required": ["texto", "fontes", "status", "tipo"]}},
        "confianca": {"type": "string", "enum": ["alta", "media", "baixa"]},
    },
    "required": ["facts", "confianca"],
}


def _stdout():
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


def process_topic(claude: Claude, item: dict, slug: str) -> bool:
    """Pesquisador → Validador → Analista → dossiê. Retorna True se gravou."""
    src_meta = {"title": item["titulo"], "link": item["url"], "date": item.get("publicado", "")}

    material, _ = claude.research(
        model=SONNET, system=_sys("researcher"),
        user=f"PAUTA: {item['titulo']}\nURL da fonte: {item['url']}\nResumo: {item.get('resumo','')}\n\n"
             "Apure em ≥2 fontes independentes da web e devolva o material com procedência.",
        step="pesquisador", key=slug)

    facts_txt, _ = claude.call(
        model=SONNET, system=_sys("validator"),
        user=f"MATERIAL DO PESQUISADOR:\n{material}",
        step="validador", key=slug, json_schema=VALIDATOR_SCHEMA, max_tokens=3000)
    facts = json.loads(facts_txt)

    dossier_txt, _ = claude.call(
        model=OPUS, system=_sys("analyst"),
        user=f"PAUTA: {item['titulo']}\nFONTE: {item['url']}\n\nMATERIAL APURADO:\n{material}\n\n"
             f"FATOS VALIDADOS:\n{facts_txt}\n\nMonte o dossiê.",
        step="analista", key=slug, json_schema=DOSSIER_SCHEMA, max_tokens=6000)
    write_dossier(slug, src_meta, json.loads(dossier_txt))
    return True


def main() -> int:
    _stdout()
    ap = argparse.ArgumentParser()
    ap.add_argument("--free", action="store_true", help="só RSS+dedupe, sem chave")
    ap.add_argument("--max", type=int, default=3, help="máx. de tópicos novos a processar (pago)")
    ap.add_argument("--limit", type=int, default=40, help="máx. de pautas a ler do RSS")
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"[fase-a] similaridade: {emb_which()}")
    base = base_titles()
    items = fetch_new_items(limit=args.limit, mark_seen=not args.free)
    novos = []
    for it in items:
        d = classify(it["titulo"], base, args.threshold)
        if d["decisao"] == "novo":
            novos.append((it, d["slug"]))
    print(f"\n[fase-a] {len(items)} pautas · {len(novos)} tópicos novos\n")

    if args.free:
        for it, slug in novos[:args.limit]:
            print(f"  🆕 [{it['fonte']}] {it['titulo']}")
        print("\n[fase-a] --free: triagem feita (RSS+dedupe). Pipeline pago não rodou.")
        return 0

    pend = [(it, slug) for it, slug in novos if not (KNOWLEDGE / slug / "metadata.json").exists()][:args.max]
    if args.dry_run:
        for it, slug in pend:
            print(f"  faria dossiê: {slug}  ← {it['titulo']}")
        print("[fase-a] --dry-run: nenhuma chamada à API.")
        return 0

    log = JobLog(prefix="fase-a")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[fase-a] {e}\n(use --free para a triagem determinística sem chave)")
        return 1

    ok, fail = 0, 0
    for it, slug in pend:
        if already_succeeded("analista", slug):
            continue
        try:
            print(f"  → processando: {it['titulo']}")
            process_topic(claude, it, slug)
            ok += 1
            print(f"  ✓ dossiê: {slug}")
        except SpendCapExceeded as e:
            print(f"[fase-a] PARADO: {e}")
            break
        except Exception as e:  # noqa: BLE001
            fail += 1
            log.record("fase-a", "errored", key=slug, error=str(e))
            print(f"  ! {slug}: {e}")
    print(f"\n[fase-a] OK={ok} falhas={fail} · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
