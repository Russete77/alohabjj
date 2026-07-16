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
from ingestion.rss import fetch_new_items, mark_urls_seen  # noqa: E402
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
# Lote: pontua todas as pautas candidatas numa única chamada Haiku (barato).
RADAR_BATCH_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"pautas": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {"i": {"type": "integer"}, "relevancia": {"type": "integer"},
                       "tipo": {"type": "string"}, "cortar": {"type": "boolean"},
                       "motivo": {"type": "string"}},
        "required": ["i", "relevancia", "tipo", "cortar", "motivo"]}}},
    "required": ["pautas"],
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

    # Validação é extração factual — effort baixo + folga de tokens (thinking não pode
    # consumir todo o orçamento e deixar o JSON vazio; ver guard em lib/claude).
    facts_txt, _ = claude.call(
        model=SONNET, system=_sys("validator"),
        user=f"MATERIAL DO PESQUISADOR:\n{material}",
        step="validador", key=slug, json_schema=VALIDATOR_SCHEMA, effort="low", max_tokens=5000)
    facts = json.loads(facts_txt)

    dossier_txt, _ = claude.call(
        model=OPUS, system=_sys("analyst"),
        user=f"PAUTA: {item['titulo']}\nFONTE: {item['url']}\n\nMATERIAL APURADO:\n{material}\n\n"
             f"FATOS VALIDADOS:\n{facts_txt}\n\nMonte o dossiê.",
        step="analista", key=slug, json_schema=DOSSIER_SCHEMA, max_tokens=10000)
    write_dossier(slug, src_meta, json.loads(dossier_txt))
    return True


def radar_filter(claude: Claude, novos: list[tuple[dict, str]], min_rel: int = 6):
    """Pontua as pautas candidatas (1 chamada Haiku) e corta as fracas.
    Devolve (mantidas ordenadas por relevância, urls_cortadas)."""
    linhas = [
        f"{i}. [{it['fonte']}] {it['titulo']} — {(it.get('resumo') or '')[:160]}"
        for i, (it, _slug) in enumerate(novos)
    ]
    txt, _ = claude.call(
        model=HAIKU, system=_sys("radar"),
        user="Avalie cada item novo das fontes para o canal AlohaBJJ (BJJ/grappling de elite). "
             "Para cada um dê `relevancia` 0–10, `tipo` (superluta|noticia|analise|tecnica|evento), "
             "e `cortar`=true quando for fraco, institucional/promocional, ou mero perfil de atleta "
             "sem fato novo. Corte tudo com relevância < 6.\n\nITENS:\n" + "\n".join(linhas),
        step="radar", key="lote", json_schema=RADAR_BATCH_SCHEMA, max_tokens=2000)
    scored = {p["i"]: p for p in json.loads(txt).get("pautas", [])}
    mantidas, cortadas = [], []
    for i, (it, slug) in enumerate(novos):
        p = scored.get(i, {"relevancia": 5, "cortar": False})
        if p.get("cortar") or int(p.get("relevancia", 0)) < min_rel:
            cortadas.append(it["url"])
        else:
            mantidas.append((int(p.get("relevancia", 6)), it, slug))
    mantidas.sort(key=lambda x: -x[0])
    return [(it, slug) for _r, it, slug in mantidas], cortadas


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
    # NUNCA marca na busca — só marcamos o que for RESOLVIDO (dupe/cortado/feito/sucesso).
    # Assim uma falha (ex.: 529) não 'come' a pauta: ela volta no próximo run.
    items = fetch_new_items(limit=args.limit, mark_seen=False)
    handled: list[str] = []  # urls resolvidas → viram 'seen' ao final
    novos = []
    for it in items:
        d = classify(it["titulo"], base, args.threshold)
        if d["decisao"] == "novo":
            novos.append((it, d["slug"]))
        else:
            handled.append(it["url"])  # duplicata do acervo → resolvida
    print(f"\n[fase-a] {len(items)} pautas · {len(novos)} tópicos novos\n")

    if args.free:
        for it, slug in novos[:args.limit]:
            print(f"  🆕 [{it['fonte']}] {it['titulo']}")
        print("\n[fase-a] --free: triagem feita (RSS+dedupe). Pipeline pago não rodou.")
        return 0  # --free não persiste seen (triagem repetível)

    if args.dry_run:
        pend = [(it, slug) for it, slug in novos
                if not (KNOWLEDGE / slug / "metadata.json").exists()][:args.max]
        for it, slug in pend:
            print(f"  faria dossiê: {slug}  ← {it['titulo']}")
        print("[fase-a] --dry-run: nenhuma chamada à API (Radar/seen-log não rodam).")
        return 0

    log = JobLog(prefix="fase-a")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[fase-a] {e}\n(use --free para a triagem determinística sem chave)")
        return 1

    # Radar: pontua as candidatas e corta pauta fraca/perfil-de-atleta (1 chamada Haiku).
    if novos:
        try:
            novos, cortadas = radar_filter(claude, novos)
            handled += cortadas  # cortadas pelo Radar → resolvidas (não re-avaliar)
            print(f"[fase-a] Radar: manteve {len(novos)} · cortou {len(cortadas)}")
        except Exception as e:  # noqa: BLE001
            print(f"[fase-a] Radar falhou ({e}); seguindo sem corte")

    # separa já-feitos (resolvidos) dos pendentes; respeita --max
    pend = []
    for it, slug in novos:
        if (KNOWLEDGE / slug / "metadata.json").exists() or already_succeeded("analista", slug):
            handled.append(it["url"])  # já temos o dossiê → resolvido
        else:
            pend.append((it, slug))
    pend = pend[:args.max]

    ok, fail = 0, 0
    for it, slug in pend:
        try:
            print(f"  → processando: {it['titulo']}")
            process_topic(claude, it, slug)
            ok += 1
            handled.append(it["url"])  # sucesso → seen
            print(f"  ✓ dossiê: {slug}")
        except SpendCapExceeded as e:
            print(f"[fase-a] PARADO: {e}")
            break
        except Exception as e:  # noqa: BLE001
            fail += 1  # NÃO marca seen → re-tenta no próximo run
            log.record("fase-a", "errored", key=slug, error=str(e))
            print(f"  ! {slug}: {e}")

    n = mark_urls_seen(handled)
    print(f"\n[fase-a] OK={ok} falhas={fail} · seen +{n} · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
