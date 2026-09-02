"""
orchestrator/plan_week.py — Estrategista de Conteúdo: monta o calendário da semana.

Junta (a) pautas/dossiês disponíveis, (b) tendências da semana (knowledge/trends/latest.json)
e (c) o que já converteu (lib/tracking), e roda o content_strategist → config/calendario.json.
O /admin/calendario mostra o plano; os slots viram o roteiro do que rodar em cada canal.

Uso:
    python -m orchestrator.plan_week
    python -m orchestrator.plan_week --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.modelos import modelo_de  # noqa: E402
from lib import config_store  # noqa: E402
from lib.claude import Claude, SONNET, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"
CAL = ROOT / "config" / "calendario.json"

CAL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "semana_de": {"type": "string"}, "tese_da_semana": {"type": "string"},
        "apostas": {"type": "object", "additionalProperties": False,
                    "properties": {"viralizacao_tiktok": {"type": "string"}},
                    "required": ["viralizacao_tiktok"]},
        "dias": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "dia": {"type": "string"}, "foco": {"type": "string"},
                "slots": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "properties": {"canal": {"type": "string"}, "formato": {"type": "string"},
                                   "pauta_slug": {"type": "string"}, "angulo": {"type": "string"},
                                   "gancho": {"type": "string"}, "produto": {"type": "string"}},
                    "required": ["canal", "formato", "pauta_slug", "angulo", "produto"]}}},
            "required": ["dia", "foco", "slots"]}},
    },
    "required": ["semana_de", "tese_da_semana", "apostas", "dias"],
}


def _pautas(n: int = 14) -> list[dict]:
    kn = ROOT / "knowledge"
    if not kn.exists():
        return []
    dirs = [d for d in kn.iterdir() if d.is_dir()
            and d.name not in ("_backfill", "atletas", "sources", "trends")]
    dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    out: list[dict] = []
    for d in dirs[:n]:
        try:
            meta = json.loads((d / "metadata.json").read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            meta = {}
        out.append({"slug": d.name, "evento": meta.get("evento", ""),
                    "categoria": meta.get("categoria", ""), "atletas": meta.get("atletas", [])})
    return out


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pautas = _pautas()
    trends_f = ROOT / "knowledge" / "trends" / "latest.md"
    trends = trends_f.read_text(encoding="utf-8") if trends_f.exists() else "(sem tendências ainda — rode scout_trends)"
    conv = ""
    try:
        from lib import tracking
        conv = tracking.conversion_memory()  # o que vende (se houver)
    except Exception:  # noqa: BLE001
        pass

    if args.dry_run:
        print(f"[plano] --dry-run: {len(pautas)} pauta(s) + tendências={'sim' if trends_f.exists() else 'não'}. Sem API.")
        return 0

    log = JobLog(prefix="plano")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[plano] {e}"); return 1

    system = config_store.read("agents/content_strategist/system.md")
    user = ("PAUTAS DISPONÍVEIS (slug · evento · categoria · atletas):\n"
            + json.dumps(pautas, ensure_ascii=False, indent=1)
            + f"\n\nTENDÊNCIAS DA SEMANA:\n{trends}"
            + (f"\n\nO QUE JÁ CONVERTEU:\n{conv}" if conv else "")
            + "\n\nMonte o calendário de 7 dias respeitando a régua de cada canal e variando o mix. SÓ JSON.")
    try:
        txt, _ = claude.call(model=modelo_de("content_strategist"), system=system, user=user, step="content_strategist",
                             key="semana", json_schema=CAL_SCHEMA, effort="medium", max_tokens=6000)
    except SpendCapExceeded as e:
        print(f"[plano] PARADO: {e}"); return 1
    data = json.loads(txt)

    CAL.parent.mkdir(parents=True, exist_ok=True)
    CAL.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    dias = data.get("dias", [])
    slots = sum(len(d.get("slots", [])) for d in dias)
    print(f"[plano] semana de {data.get('semana_de','?')}: {len(dias)} dias · {slots} slots "
          f"→ config/calendario.json · custo ≈ ${log.total_cost():.4f}")
    print(f"  aposta viral: {data.get('apostas',{}).get('viralizacao_tiktok','—')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
