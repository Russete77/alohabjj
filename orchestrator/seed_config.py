"""
orchestrator/seed_config.py — empurra a configuração do ARQUIVO para o BANCO.

A regra da casa é que o banco manda e o arquivo do git é semente. Este é o
único jeito de inverter isso de propósito — e é sempre explícito, porque
sobrescrever é destrutivo: apaga a edição que o operador fez no painel.

    python -m orchestrator.seed_config --diff            # o que difere (não grava)
    python -m orchestrator.seed_config --all             # tudo, com confirmação
    python -m orchestrator.seed_config --file config/fontes.yaml
    python -m orchestrator.seed_config --all --sim       # sem perguntar (CI)

Depois de rodar o db/migrations/2026-09-02-fase3-config.sql.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import config_store as cs  # noqa: E402


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="semeia tudo que o painel edita")
    ap.add_argument("--file", help="semeia um path só (ex.: config/fontes.yaml)")
    ap.add_argument("--diff", action="store_true", help="só mostra o que difere")
    ap.add_argument("--sim", action="store_true", help="não pergunta antes de sobrescrever")
    args = ap.parse_args()

    if not cs._habilitado():
        print("[seed] Supabase desabilitado (faltam SUPABASE_URL/SERVICE_ROLE_KEY).")
        return 1

    gerenciados = cs.paths_gerenciados()

    if args.diff:
        fora = cs.diverged()
        if not fora:
            print(f"[seed] {len(gerenciados)} path(s) gerenciado(s) — nenhum difere do banco.")
            return 0
        print(f"[seed] {len(fora)} path(s) diferem. O BANCO está valendo em todos:")
        for p in fora:
            print(f"   ≠ {p}")
        print("\nPara fazer o ARQUIVO valer: --file <path> (ou --all).")
        return 0

    if args.file:
        alvos = [args.file]
    elif args.all:
        alvos = gerenciados
    else:
        ap.error("escolha --all, --file <path> ou --diff")
        return 2

    # Sobrescrever apaga o que foi editado no painel. Avisa quantos vão perder
    # a edição antes de fazer — a lista de divergentes é exatamente essa conta.
    divergentes = set(cs.diverged(alvos))
    if divergentes and not args.sim:
        print(f"[seed] {len(divergentes)} path(s) têm no banco algo DIFERENTE do arquivo:")
        for p in sorted(divergentes):
            print(f"   ≠ {p}")
        print("\nSemear vai SOBRESCREVER essas edições com o conteúdo do arquivo.")
        try:
            if input("Digite 'semear' para confirmar: ").strip().lower() != "semear":
                print("[seed] cancelado — nada foi gravado.")
                return 1
        except EOFError:
            print("[seed] sem terminal interativo; use --sim se é isso mesmo que você quer.")
            return 1

    ok = falhou = 0
    for path in alvos:
        try:
            if cs.seed(path):
                ok += 1
                print(f"  ✓ {path}")
            else:
                falhou += 1
                print(f"  ! {path}: o banco recusou")
        except FileNotFoundError:
            falhou += 1
            print(f"  ! {path}: não existe no disco")
        except Exception as e:  # noqa: BLE001
            falhou += 1
            print(f"  ! {path}: {e}")

    print(f"\n[seed] {ok} semeado(s) · {falhou} falha(s). O banco agora vale nesses paths.")
    return 0 if falhou == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
