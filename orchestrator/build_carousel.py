"""
orchestrator/build_carousel.py — Fase B: gera um carrossel a partir de um dossiê.

Fluxo (PRD §10, §12, §17):
  Supervisor de Vendas (Sonnet)  -> brief (produto + CTA + disclosure CONAR)
  Carrossel (Sonnet)             -> slides + caption + hashtags + hero?
  Avaliador / quality gate (Haiku) -> aprova/rejeita antes do painel
  [se hero_complexo] imagegen (Gemini/GPT/Runway) -> outputs/<slug>/hero.png

Saída: outputs/<slug>/{slides.json, caption.txt, meta.json}
Requer ANTHROPIC_API_KEY (texto). Imagem complexa requer chave de imagem.

Uso:
    python -m orchestrator.build_carousel <slug>
    python -m orchestrator.build_carousel <slug> --slides 4
    python -m orchestrator.build_carousel <slug> --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, HAIKU  # noqa: E402
from lib.jobs import JobLog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"
OUTPUTS = ROOT / "outputs"
AGENTS = ROOT / "agents"


def _sys(name: str) -> str:
    return (AGENTS / name / "system.md").read_text(encoding="utf-8")


def _load_dossier(slug: str) -> dict:
    d = KNOWLEDGE / slug
    if not (d / "metadata.json").exists():
        raise SystemExit(f"Dossiê não encontrado: {slug}. Rode a Fase 0/build_dossiers antes.")
    return {
        "summary": (d / "summary.md").read_text(encoding="utf-8"),
        "angles": (d / "angles.md").read_text(encoding="utf-8"),
        "metadata": json.loads((d / "metadata.json").read_text(encoding="utf-8")),
    }


BRIEF_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "produto_id": {"type": "string"}, "cta_texto": {"type": "string"},
        "gancho": {"type": "string"}, "formato": {"type": "string", "enum": ["integrado", "separado"]},
        "disclosure_obrigatorio": {"type": "boolean"}, "disclosure_texto": {"type": "string"},
        "cupom": {"type": "string"},
    },
    "required": ["produto_id", "cta_texto", "gancho", "formato", "disclosure_obrigatorio", "disclosure_texto", "cupom"],
}

CAROUSEL_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "slides": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"kicker": {"type": "string"}, "titulo": {"type": "string"},
                           "corpo": {"type": "string"}, "cta": {"type": "boolean"}},
            "required": ["kicker", "titulo", "corpo", "cta"]}},
        "caption": {"type": "string"}, "hashtags": {"type": "array", "items": {"type": "string"}},
        "primeiro_comentario": {"type": "string"},
        "hero_complexo": {"type": "boolean"}, "hero_prompt": {"type": "string"},
    },
    "required": ["slides", "caption", "hashtags", "primeiro_comentario", "hero_complexo", "hero_prompt"],
}

VERDICT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"nota": {"type": "integer"}, "aprovado": {"type": "boolean"},
                   "motivos": {"type": "array", "items": {"type": "string"}},
                   "correcoes_sugeridas": {"type": "array", "items": {"type": "string"}}},
    "required": ["nota", "aprovado", "motivos", "correcoes_sugeridas"],
}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--slides", type=int, default=6, choices=[4, 6])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dossier = _load_dossier(args.slug)
    catalogo = (ROOT / "config" / "catalogo.yaml").read_text(encoding="utf-8")
    voz = (ROOT / "config" / "voz.md").read_text(encoding="utf-8")
    print(f"[carrossel] dossiê={args.slug} slides={args.slides}")

    if args.dry_run:
        print("[carrossel] --dry-run: prompts montados; NENHUMA chamada à API.")
        print(f"  Supervisor: catalogo={len(catalogo)}c  Carrossel: voz={len(voz)}c + dossiê")
        return 0

    log = JobLog(prefix="carrossel")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[carrossel] {e}")
        return 1

    # 1) Supervisor de Vendas
    brief_txt, _ = claude.call(
        model=SONNET, system=_sys("sales_supervisor"),
        user=f"CATÁLOGO:\n{catalogo}\n\nDOSSIÊ:\n{dossier['summary']}\n\nÂNGULOS:\n{dossier['angles']}",
        step="supervisor", key=args.slug, json_schema=BRIEF_SCHEMA, max_tokens=1500)
    brief = json.loads(brief_txt)
    print(f"  ✓ Supervisor: produto={brief['produto_id']} disclosure={brief['disclosure_obrigatorio']}")

    # 2) Carrossel
    car_txt, _ = claude.call(
        model=SONNET, system=_sys("carousel"),
        user=(f"VOZ DA MARCA:\n{voz}\n\nDOSSIÊ:\n{dossier['summary']}\n\nÂNGULOS:\n{dossier['angles']}\n\n"
              f"BRIEF DO SUPERVISOR:\n{brief_txt}\n\nGere um carrossel de {args.slides} slides."),
        step="carrossel", key=args.slug, json_schema=CAROUSEL_SCHEMA, max_tokens=4000)
    car = json.loads(car_txt)
    print(f"  ✓ Carrossel: {len(car['slides'])} slides, hero_complexo={car['hero_complexo']}")

    # 3) Avaliador (quality gate)
    ver_txt, _ = claude.call(
        model=HAIKU, system=_sys("evaluator"),
        user=f"PEÇA:\n{car_txt}\n\nBRIEF:\n{brief_txt}\n\nDOSSIÊ:\n{dossier['summary']}",
        step="avaliador", key=args.slug, json_schema=VERDICT_SCHEMA, max_tokens=1200)
    ver = json.loads(ver_txt)
    print(f"  {'✓' if ver['aprovado'] else '✗'} Avaliador: nota={ver['nota']} aprovado={ver['aprovado']}")
    if not ver["aprovado"]:
        print(f"    motivos: {'; '.join(ver['motivos'])}")

    # 4) hero complexo (opcional)
    out = OUTPUTS / args.slug
    out.mkdir(parents=True, exist_ok=True)
    hero_path = None
    if car["hero_complexo"] and car["hero_prompt"]:
        try:
            from lib.imagegen import generate_image, which
            if which() != "nenhum (sem chave)":
                hero_path = generate_image(car["hero_prompt"], out / "hero.png", ratio="3:4", log=log, key=args.slug)
                print(f"  ✓ hero: {hero_path.name} (via {which()})")
            else:
                print("  · hero_complexo pedido, mas nenhum provedor de imagem tem chave — pulado")
        except Exception as e:  # noqa: BLE001
            print(f"  ! hero falhou: {e}")

    # 5) grava outputs
    (out / "slides.json").write_text(json.dumps(car["slides"], ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "caption.txt").write_text(
        car["caption"] + "\n\n" + " ".join(car["hashtags"]) + "\n\n" + car["primeiro_comentario"] + "\n",
        encoding="utf-8")
    meta = {
        "dossie": args.slug, "formato": brief["formato"], "produto_id": brief["produto_id"],
        "cta": brief["cta_texto"], "caption": car["caption"], "hashtags": car["hashtags"],
        "tracked_url": f"?utm_source=ig&utm_content={args.slug}",
        "disclosure": brief["disclosure_texto"] if brief["disclosure_obrigatorio"] else None,
        "is_ai_generated": True, "hero": hero_path.name if hero_path else None,
        "quality": {"nota": ver["nota"], "aprovado": ver["aprovado"]},
        "estado": "aprovado" if ver["aprovado"] else "rejeitado",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # 6) render dos slides como PNG 1080x1350 (feed IG) — post-ready
    try:
        import subprocess
        r = subprocess.run(["node", "scripts/render_slides.mjs", "--slug", args.slug],
                           cwd=str(ROOT / "web"), capture_output=True, text=True, timeout=90)
        if r.returncode == 0:
            print(f"  ✓ {r.stdout.strip()}")
        else:
            print(f"  ! render de slides falhou: {r.stderr.strip() or r.stdout.strip()}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! render de slides falhou: {e}")

    print(f"[carrossel] OK → {out} · custo ≈ ${log.total_cost():.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
