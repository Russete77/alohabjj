"""
orchestrator/distill_voice.py — Etapa 3 do Bootstrap (PRD §14).

Lê os artigos do raw store (knowledge/_backfill/) e roda o Analista/Opus para
destilar a voz da marca em config/voz.md.

Requer ANTHROPIC_API_KEY (etapa paga).
Uso:
    python -m orchestrator.distill_voice            # gera config/voz.md
    python -m orchestrator.distill_voice --dry-run  # monta o prompt e mostra o custo estimado, sem chamar a API
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, OPUS  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BACKFILL = ROOT / "knowledge" / "_backfill"
SYSTEM = (ROOT / "agents" / "voice_distiller" / "system.md").read_text(encoding="utf-8")
OUT = ROOT / "config" / "voz.md"

# limita o material pra caber com folga no contexto e no custo (amostra representativa)
MAX_ARTICLES = 30
MAX_CHARS_EACH = 2500


def _try_stdout_utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass


def build_corpus() -> str:
    files = sorted(BACKFILL.glob("*.md"))[:MAX_ARTICLES]
    if not files:
        raise SystemExit("Nenhum artigo em knowledge/_backfill/. Rode ingestion.wp_backfill primeiro.")
    parts = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        # descarta o frontmatter YAML (entre os dois '---') para o corpus
        body = text.split("---", 2)[-1].strip()
        parts.append(body[:MAX_CHARS_EACH])
    return "\n\n=====\n\n".join(parts)


def main() -> int:
    _try_stdout_utf8()
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--effort", default="high")
    args = parser.parse_args()

    corpus = build_corpus()
    user = (
        "A seguir, uma amostra dos artigos publicados no AlohaBJJNews. "
        "Destile a voz da marca conforme suas instruções e escreva o voz.md.\n\n"
        f"{corpus}"
    )
    print(f"[voz] {len(corpus)} chars de corpus, {corpus.count('=====') + 1} artigos")

    if args.dry_run:
        print("[voz] --dry-run: prompt montado; NENHUMA chamada à API foi feita.")
        print(f"[voz] system={len(SYSTEM)} chars, user={len(user)} chars")
        return 0

    log = JobLog(prefix="voz")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[voz] {e}")
        return 1
    print(f"[voz] run_id={log.run_id} — chamando {OPUS.id} (effort={args.effort})…")
    text, usage = claude.call(
        model=OPUS, system=SYSTEM, user=user,
        step="distill_voice", key="voz", max_tokens=8000, effort=args.effort,
    )
    OUT.write_text(text.strip() + "\n", encoding="utf-8")
    print(f"[voz] OK — {OUT} ({len(text)} chars) | "
          f"in={usage['in_tok']} out={usage['out_tok']} custo=${usage['cost']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
