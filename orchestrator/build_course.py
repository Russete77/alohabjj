"""
orchestrator/build_course.py — Fase 3.1: o Course Builder monta um curso de BJJ.

Dado um TEMA, o agente escreve o currículo (módulos + aulas + descrição didática) no tom
da marca; gravamos em config/cursos/<slug>.yaml com os vídeos VAZIOS (o Lucas cola os links
depois, no /admin/cursos). A página /curso já toca tudo hospedado no nosso site.

Uso:
  python -m orchestrator.build_course --tema "montada inescapável" --modulos 3 --dry-run
  python -m orchestrator.build_course --tema "leg locks no No-Gi"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, OPUS, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"
CURSOS = ROOT / "config" / "cursos"

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "slug": {"type": "string"}, "titulo": {"type": "string"},
        "subtitulo": {"type": "string"}, "descricao": {"type": "string"},
        "badge": {"type": "string"},
        "modulos": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {"titulo": {"type": "string"}, "aulas": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "properties": {"titulo": {"type": "string"}, "descricao": {"type": "string"}},
                "required": ["titulo", "descricao"]}}},
            "required": ["titulo", "aulas"]}},
    },
    "required": ["slug", "titulo", "subtitulo", "descricao", "badge", "modulos"],
}


def _yaml_dump(c: dict) -> str:
    """Escreve o YAML do curso no nosso formato (com video/descricao por aula)."""
    from ruamel.yaml.scalarstring import LiteralScalarString  # noqa: F401
    lines = [
        f"# config/cursos/{c['slug']}.yaml — gerado pelo Course Builder. Cole os vídeos por aula.",
        f"slug: {c['slug']}",
        f"titulo: {json.dumps(c['titulo'], ensure_ascii=False)}",
        f"subtitulo: {json.dumps(c['subtitulo'], ensure_ascii=False)}",
        f"descricao: {json.dumps(c['descricao'], ensure_ascii=False)}",
        "gratis: true",
        f"badge: {json.dumps(c['badge'], ensure_ascii=False)}",
        'capa: ""',
        "modulos:",
    ]
    for m in c["modulos"]:
        lines.append(f"  - titulo: {json.dumps(m['titulo'], ensure_ascii=False)}")
        lines.append("    aulas:")
        for a in m["aulas"]:
            t = json.dumps(a["titulo"], ensure_ascii=False)
            d = json.dumps(a.get("descricao", ""), ensure_ascii=False)
            lines.append(f'      - {{ titulo: {t}, video: "", descricao: {d} }}')
    lines += [
        "recomendados:",
        '  - { nome: "Hayabusa Fightwear", url: "https://lcshop.co/EeJo0L", desc: "Kimono e gear de alto desempenho — cupom LUCAS." }',
        '  - { nome: "Loja BJJ3D", url: "https://shopee.com.br/bjj3doficial", desc: "Produtos 3D exclusivos AlohaBJJ." }',
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tema", required=True, help="tema/posição do curso")
    ap.add_argument("--modulos", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    voz = (ROOT / "config" / "voz.md").read_text(encoding="utf-8")
    system = (AGENTS / "course_builder" / "system.md").read_text(encoding="utf-8")
    user = (f"VOZ DA MARCA:\n{voz}\n\nTEMA DO CURSO: {args.tema}\n"
            f"Monte um curso com ~{args.modulos} módulos. Aulas curtas, uma ideia cada.")

    if args.dry_run:
        print(f"[curso] --dry-run: montaria curso de '{args.tema}' (~{args.modulos} módulos). Sem IA.")
        return 0

    log = JobLog(prefix="curso")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[curso] {e}")
        return 1
    try:
        txt, _ = claude.call(model=OPUS, system=system, cache=voz, user=user,
                             step="course_builder", key=args.tema[:40], json_schema=SCHEMA,
                             max_tokens=6000)
    except SpendCapExceeded as e:
        print(f"[curso] PARADO: {e}")
        return 1
    c = json.loads(txt)
    c["slug"] = re.sub(r"[^a-z0-9-]", "", (c.get("slug") or args.tema).lower().replace(" ", "-"))[:40] or "curso"
    CURSOS.mkdir(parents=True, exist_ok=True)
    out = CURSOS / f"{c['slug']}.yaml"
    out.write_text(_yaml_dump(c), encoding="utf-8")
    n = sum(len(m["aulas"]) for m in c["modulos"])
    print(f"[curso] ✓ {c['titulo']} — {len(c['modulos'])} módulos, {n} aulas → {out}")
    print(f"        Cole os vídeos no campo `video` de cada aula em {out.name}. custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
