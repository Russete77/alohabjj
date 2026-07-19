"""
orchestrator/ideate.py — esteiras de IDEIA de produto próprio (margem cheia).

  --kind 3d      → product_ideator_3d  → data/ideas_3d.json      (loja bjj3d / Shopee)
  --kind cursos  → course_ideator      → data/ideas_courses.json (alimenta o course_builder)

Roda barato (Haiku + busca web por padrão; SCOUT_MODEL=sonnet no .env p/ mais profundidade).
O /admin/ideias mostra os cards; você aprova o que vira produto/curso.

Uso:
    python -m orchestrator.ideate --kind 3d
    python -m orchestrator.ideate --kind cursos
    python -m orchestrator.ideate --kind 3d --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, HAIKU, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

IDEA_MODEL = SONNET if os.getenv("SCOUT_MODEL", "haiku").lower().startswith("son") else HAIKU

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"
DATA = ROOT / "data"

KINDS = {
    "3d": {
        "agent": "product_ideator_3d", "out": "ideas_3d.json", "step": "ideator_3d",
        "task": ("Pesquise o que vende em impressão 3D no BJJ (Etsy/Shopee/Mercado Livre) e proponha "
                 "produtos 3D que imprimem bem e vendem. Case com nosso momento (atleta/evento em alta). "
                 "SÓ o JSON do contrato."),
    },
    "cursos": {
        "agent": "course_ideator", "out": "ideas_courses.json", "step": "ideator_cursos",
        "task": ("Pesquise o que a comunidade de BJJ mais pergunta/quer aprender e onde há lacuna de "
                 "curso. Cruze com nossas pautas recorrentes. Proponha cursos (com 1 isca grátis). "
                 "SÓ o JSON do contrato."),
    },
}


def _recent(n: int = 10) -> list[str]:
    kn = ROOT / "knowledge"
    if not kn.exists():
        return []
    dirs = [d for d in kn.iterdir() if d.is_dir()
            and d.name not in ("_backfill", "atletas", "sources", "trends")]
    dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    out: list[str] = []
    for d in dirs[:n]:
        try:
            meta = json.loads((d / "metadata.json").read_text(encoding="utf-8"))
            out.append(meta.get("evento") or d.name.replace("-", " "))
        except Exception:  # noqa: BLE001
            out.append(d.name.replace("-", " "))
    return out


def _json_extract(text: str) -> dict | None:
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except Exception:  # noqa: BLE001
                        break
        start = text.find("{", start + 1)
    return None


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=list(KINDS), required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cfg = KINDS[args.kind]

    pautas = _recent()
    if args.dry_run:
        print(f"[ideias:{args.kind}] --dry-run: usaria {len(pautas)} pauta(s) de contexto. Sem API.")
        return 0

    log = JobLog(prefix=f"ideias-{args.kind}")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[ideias:{args.kind}] {e}"); return 1

    system = (AGENTS / cfg["agent"] / "system.md").read_text(encoding="utf-8")
    user = (cfg["task"] + "\n\nNOSSAS PAUTAS RECENTES (contexto de autoridade/interesse):\n- "
            + "\n- ".join(pautas))
    try:
        txt, _ = claude.research(model=IDEA_MODEL, system=system, user=user, step=cfg["step"],
                                 key=args.kind, max_uses=4, max_tokens=3500)
    except SpendCapExceeded as e:
        print(f"[ideias:{args.kind}] PARADO: {e}"); return 1
    data = _json_extract(txt)
    if not data:
        print(f"[ideias:{args.kind}] não consegui extrair JSON da busca."); return 1

    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / cfg["out"]).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    ideias = data.get("ideias", [])
    print(f"[ideias:{args.kind}] {len(ideias)} ideia(s) → data/{cfg['out']} · custo ≈ ${log.total_cost():.4f}")
    for it in ideias:
        print(f"  • {it.get('nome') or it.get('titulo','?')} (fit {it.get('fit','?')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
