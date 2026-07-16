"""
scripts/daily.py — Loop diário (PRD §19). Roda a Fase A (inteligência) e deixa a
base crescer sozinha. A Fase B (geração) é disparada depois, sobre os dossiês do dia.

Pensado para rodar por agendador (cron no Linux, Agendador de Tarefas no Windows).

Windows (Agendador de Tarefas), todo dia às 06:00:
    schtasks /Create /TN "AlohaBJJ Fase A" /SC DAILY /ST 06:00 ^
      /TR "cmd /c cd /d C:\\Users\\erick\\bjj-lucas && python -m scripts.daily >> logs\\daily.log 2>&1"

Linux/cron (crontab -e):
    0 6 * * *  cd /caminho/bjj-lucas && /usr/bin/python -m scripts.daily >> logs/daily.log 2>&1

Requer ANTHROPIC_API_KEY para o processamento pago (Radar/Pesquisador/Validador/Analista).
Sem a chave, roda a triagem determinística (--free) e apenas registra as pautas novas.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
(ROOT / "logs").mkdir(exist_ok=True)


def main() -> int:
    from orchestrator import phase_a

    has_key = bool(os.getenv("ANTHROPIC_API_KEY"))
    print(f"\n===== LOOP DIÁRIO · {time.strftime('%Y-%m-%d %H:%M:%S')} · "
          f"{'pago' if has_key else 'triagem grátis (sem chave)'} =====")

    argv = ["--max", os.getenv("DAILY_MAX_NEW", "5")]
    if not has_key:
        argv = ["--free"]
    sys.argv = ["phase_a"] + argv
    return phase_a.main()


if __name__ == "__main__":
    raise SystemExit(main())
