"""
orchestrator/enrich_athlete.py — enriquece o cadastro de atletas com pesquisa na web.

Pra cada atleta do config/atletas.yaml (ou um --slug), o Athlete Scout pesquisa
(cartel, equipe, estilo, preparação, últimas notícias e posts do X) e grava o perfil em
knowledge/atletas/<slug>.md. Esse perfil vira contexto pro Analista/Carrossel cobrirem lutas.

Uso:
  python -m orchestrator.enrich_athlete --slug gordon-ryan
  python -m orchestrator.enrich_athlete --max 5        # os 5 primeiros sem perfil
  python -m orchestrator.enrich_athlete --slug mica-galvao --dry-run
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"
OUT = ROOT / "knowledge" / "atletas"
REG = ROOT / "config" / "atletas.yaml"


def _registry() -> list[dict]:
    from ruamel.yaml import YAML
    data = YAML(typ="safe", pure=True).load(REG.read_text(encoding="utf-8")) or {}
    return data.get("atletas", []) or []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="enriquece um atleta específico")
    ap.add_argument("--max", type=int, default=5, help="quantos (sem perfil ainda) enriquecer")
    ap.add_argument("--force", action="store_true", help="reenriquece mesmo com perfil existente")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    reg = _registry()
    if args.slug:
        alvos = [a for a in reg if a.get("slug") == args.slug]
        if not alvos:
            print(f"[atleta] slug '{args.slug}' não está no config/atletas.yaml"); return 1
    else:
        alvos = [a for a in reg if args.force or not (OUT / f"{a['slug']}.md").exists()][:args.max]

    print(f"[atleta] {len(alvos)} atleta(s) a enriquecer")
    if args.dry_run:
        for a in alvos:
            print(f"  faria: {a['nome']}  (@{a.get('x') or '—'})")
        print("[atleta] --dry-run: nenhuma chamada à IA."); return 0

    log = JobLog(prefix="atleta")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[atleta] {e}"); return 1

    system = (AGENTS / "athlete_scout" / "system.md").read_text(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for a in alvos:
        nome, xh, bh = a["nome"], a.get("x", ""), a.get("bjjheroes", "")
        user = (f"ATLETA: {nome}\n"
                f"{'@ do X: ' + xh if xh else 'X: (desconhecido — descubra o oficial se houver)'}\n"
                f"{'BJJ Heroes: ' + bh if bh else ''}\n\n"
                "Pesquise na web (BJJ Heroes, FloGrappling, notícias, X do atleta) e escreva o "
                "perfil em markdown no formato do sistema. Fatos com fonte; sem inventar.")
        try:
            txt, _ = claude.research(model=SONNET, system=system, user=user,
                                     step="athlete_scout", key=a["slug"], max_uses=6, max_tokens=3000)
        except SpendCapExceeded as e:
            print(f"[atleta] PARADO: {e}"); break
        except Exception as e:  # noqa: BLE001
            print(f"  ! {nome}: {e}"); continue
        (OUT / f"{a['slug']}.md").write_text(txt.strip() + "\n", encoding="utf-8")
        ok += 1
        print(f"  ✓ perfil: {nome} → knowledge/atletas/{a['slug']}.md")

    print(f"\n[atleta] {ok} perfil(is) · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
