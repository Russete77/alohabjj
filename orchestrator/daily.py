"""
orchestrator/daily.py — o dia da máquina, sem você clicar.

Encadeia a INTELIGÊNCIA + o PLANEJAMENTO (não publica em rede social — isso segue manual/
copiar-e-colar por decisão de produto). A cada execução:
  1. Fase A: pega notícia nova e vira dossiê (--max)
  2. Trend Scout: atualiza o que está bombando (1×/dia basta)
  3. Estrategista: replaneja o calendário da semana com o que chegou
  4. Publica o snapshot pro deploy (Storage)

Feito pra rodar no Agendador de Tarefas do Windows (ver scripts/register_daily_task.ps1).
Cada passo é best-effort: um falhar não derruba os outros. Loga em jobs/daily-<data>.log.

Uso:
    python -m orchestrator.daily
    python -m orchestrator.daily --max 3 --no-trends
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "jobs"


def _step(name: str, args: list[str], logf) -> bool:
    stamp = time.strftime("%H:%M:%S")
    head = f"\n=== [{stamp}] {name} ===\n$ python {' '.join(args)}\n"
    print(head.rstrip()); logf.write(head)
    try:
        r = subprocess.run([sys.executable, *args], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=1800,
                           env={"PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1", **_env()})
        out = (r.stdout or "") + (r.stderr or "")
        print(out.rstrip()); logf.write(out)
        return r.returncode == 0
    except Exception as e:  # noqa: BLE001
        msg = f"[daily] {name} FALHOU: {e}\n"
        print(msg.rstrip()); logf.write(msg)
        return False


def _env() -> dict:
    import os
    return dict(os.environ)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=2, help="quantas pautas novas na Fase A")
    ap.add_argument("--no-trends", action="store_true", help="pula o Trend Scout hoje")
    args = ap.parse_args()

    JOBS.mkdir(exist_ok=True)
    day = time.strftime("%Y%m%d")
    with open(JOBS / f"daily-{day}.log", "a", encoding="utf-8") as logf:
        logf.write(f"\n\n######## RUN {time.strftime('%Y-%m-%d %H:%M:%S')} ########\n")
        ok = {}
        ok["fase_a"] = _step("Fase A (inteligência)", ["-m", "orchestrator.phase_a", "--max", str(args.max)], logf)
        if not args.no_trends:
            ok["trends"] = _step("Trend Scout", ["-m", "orchestrator.scout_trends"], logf)
        ok["plano"] = _step("Estrategista (calendário)", ["-m", "orchestrator.plan_week"], logf)
        ok["deploy"] = _step("Publica snapshot", ["-m", "orchestrator.sync_to_cloud"], logf)

        resumo = " · ".join(f"{k}={'ok' if v else 'FALHOU'}" for k, v in ok.items())
        tail = f"\n[daily] fim: {resumo}\n"
        print(tail.rstrip()); logf.write(tail)
    return 0 if all(ok.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
