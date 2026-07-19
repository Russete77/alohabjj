"""
orchestrator/scout_trends.py — Trend Scout: o esquema de viralização da semana.

Roda o agente trend_scout (Haiku + busca web, barato) e grava:
  knowledge/trends/latest.json   (estruturado — o pipeline lê)
  knowledge/trends/latest.md     (legível — o /admin mostra)

O TikTok/Instagram Publisher passam a receber essas tendências como contexto, então o
áudio sugerido e o gancho seguem o que está bombando AGORA — sem copiar cego.

Uso:
    python -m orchestrator.scout_trends
    python -m orchestrator.scout_trends --dry-run
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

# barato por padrão (é coleta/observação); sonnet no .env se quiser mais profundidade
TREND_MODEL = SONNET if os.getenv("SCOUT_MODEL", "haiku").lower().startswith("son") else HAIKU

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"
OUT = ROOT / "knowledge" / "trends"


def _recent_pautas(n: int = 8) -> list[str]:
    """Alguns títulos de dossiês recentes, pro Trend Scout casar assunto quente com o que temos."""
    kn = ROOT / "knowledge"
    if not kn.exists():
        return []
    dirs = [d for d in kn.iterdir() if d.is_dir() and d.name not in ("_backfill", "atletas", "sources", "trends")]
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


def _to_md(data: dict) -> str:
    lines = [f"# Tendências de vídeo curto — {data.get('gerado_em','')}", "",
             f"_{data.get('resumo','')}_", ""]
    for t in data.get("tendencias", []):
        lines += [f"## {t.get('titulo','?')}  ·  {t.get('tipo','')}  ·  fit {t.get('fit','?')}/5",
                  f"- **O que é:** {t.get('o_que_e','')}",
                  f"- **Por que pega:** {t.get('por_que_pega','')}",
                  f"- **Como aplicar:** {t.get('como_aplicar','')}",
                  f"- **Áudio:** {t.get('audio_sugerido','')}",
                  f"- **Hook exemplo:** {t.get('exemplo_hook','')}",
                  f"- **Melhor para:** {t.get('melhor_para','')}", ""]
    return "\n".join(lines)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pautas = _recent_pautas()
    if args.dry_run:
        print(f"[trends] --dry-run: buscaria tendências casando com {len(pautas)} pauta(s). Sem API.")
        return 0

    log = JobLog(prefix="trends")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[trends] {e}"); return 1

    system = (AGENTS / "trend_scout" / "system.md").read_text(encoding="utf-8")
    user = ("Pesquise na web o que está bombando AGORA em TikTok/Reels no nicho de Jiu-Jitsu/"
            "grappling/luta (áudios em alta, formatos, ganchos, assuntos quentes das últimas 2 "
            "semanas). Case, quando fizer sentido, com estas pautas que já temos:\n- "
            + "\n- ".join(pautas) + "\n\nDevolva SOMENTE o JSON do contrato.")
    try:
        txt, _ = claude.research(model=TREND_MODEL, system=system, user=user, step="trend_scout",
                                 key="semana", max_uses=4, max_tokens=3000)
    except SpendCapExceeded as e:
        print(f"[trends] PARADO: {e}"); return 1
    data = _json_extract(txt)
    if not data:
        print("[trends] não consegui extrair JSON da busca."); return 1

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "latest.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "latest.md").write_text(_to_md(data), encoding="utf-8")
    n = len(data.get("tendencias", []))
    print(f"[trends] {n} tendência(s) → knowledge/trends/latest.json · custo ≈ ${log.total_cost():.4f}")
    for t in data.get("tendencias", []):
        print(f"  • {t.get('titulo','?')} ({t.get('tipo','')}, fit {t.get('fit','?')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
