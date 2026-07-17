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
import os
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


def _catalog_product(pid: str) -> dict | None:
    from ruamel.yaml import YAML
    data = YAML(typ="safe", pure=True).load((ROOT / "config" / "catalogo.yaml").read_text(encoding="utf-8"))
    return next((p for p in data.get("produtos", []) if p.get("id") == pid), None)


def _attach_affiliate(brief: dict, slug: str, log: JobLog) -> dict:
    """Se o produto é afiliado e tem `busca`, procura o campeão de vendas e injeta o link real."""
    prod = _catalog_product(brief.get("produto_id", ""))
    if not prod or prod.get("tipo") != "afiliado" or not prod.get("busca"):
        return brief
    try:
        from lib import affiliates
        if not affiliates.which():
            return brief   # sem credencial → segue com precisa_link=True
        hit = affiliates.best_product(prod["busca"], log=log, key=slug)
        if hit:
            brief["link_afiliado"] = hit["url"]
            brief["produto_titulo"] = hit["titulo"]
            brief["precisa_link"] = False
            print(f"  ✓ Afiliado: {hit['fonte']} → {hit['titulo'][:44]} ({hit['url'][:40]}…)")
    except Exception as e:  # noqa: BLE001
        print(f"  · afiliado não plugado ({e}); mantém precisa_link")
    return brief


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
        "produto_id": {"type": "string"}, "palavra_manychat": {"type": "string"},
        "relevancia_motivo": {"type": "string"}, "cta_texto": {"type": "string"},
        "gancho": {"type": "string"}, "formato": {"type": "string", "enum": ["integrado", "separado"]},
        "precisa_link": {"type": "boolean"},
        "disclosure_obrigatorio": {"type": "boolean"}, "disclosure_texto": {"type": "string"},
        "cupom": {"type": "string"},
    },
    "required": ["produto_id", "palavra_manychat", "relevancia_motivo", "cta_texto", "gancho", "formato",
                 "precisa_link", "disclosure_obrigatorio", "disclosure_texto", "cupom"],
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
    },
    "required": ["slides", "caption", "hashtags", "primeiro_comentario"],
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
    # base de conhecimento (fontes cadastradas no /admin/conhecimento)
    from lib import sources as _src
    know_sup = _src.text_for("sales_supervisor")
    know_car = _src.text_for("carousel")
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

    # 1) Supervisor de Vendas — recebe a MEMÓRIA DE CONVERSÃO (aprende o que vende)
    from lib.tracking import conversion_memory
    mem = conversion_memory()
    brief_txt, _ = claude.call(
        model=SONNET, system=_sys("sales_supervisor"),
        user=f"CATÁLOGO:\n{catalogo}\n\n{mem}\n\n{know_sup}\n\nDOSSIÊ:\n{dossier['summary']}\n\nÂNGULOS:\n{dossier['angles']}",
        step="supervisor", key=args.slug, json_schema=BRIEF_SCHEMA, max_tokens=1500)
    brief = json.loads(brief_txt)
    print(f"  ✓ Supervisor: produto={brief['produto_id']} ({brief.get('relevancia_motivo','')[:50]}) "
          f"disclosure={brief['disclosure_obrigatorio']}{' · PRECISA LINK' if brief.get('precisa_link') else ''}")
    # 1b) afiliação: busca o link do campeão de vendas (Amazon/ML/Shopee) se houver credencial
    brief = _attach_affiliate(brief, args.slug, log)
    brief_txt = json.dumps(brief, ensure_ascii=False)  # Carrossel recebe o brief COM o link

    # 2) Carrossel
    car_txt, _ = claude.call(
        model=SONNET, system=_sys("carousel"),
        user=(f"VOZ DA MARCA:\n{voz}\n\n{know_car}\n\nDOSSIÊ:\n{dossier['summary']}\n\nÂNGULOS:\n{dossier['angles']}\n\n"
              f"BRIEF DO SUPERVISOR:\n{brief_txt}\n\nGere um carrossel de {args.slides} slides."),
        step="carrossel", key=args.slug, json_schema=CAROUSEL_SCHEMA, max_tokens=4000)
    car = json.loads(car_txt)
    print(f"  ✓ Carrossel: {len(car['slides'])} slides")

    # 3) Avaliador (quality gate)
    ver_txt, _ = claude.call(
        model=HAIKU, system=_sys("evaluator"),
        user=f"PEÇA:\n{car_txt}\n\nBRIEF:\n{brief_txt}\n\nDOSSIÊ:\n{dossier['summary']}",
        step="avaliador", key=args.slug, json_schema=VERDICT_SCHEMA, max_tokens=1200)
    ver = json.loads(ver_txt)
    print(f"  {'✓' if ver['aprovado'] else '✗'} Avaliador: nota={ver['nota']} aprovado={ver['aprovado']}")
    if not ver["aprovado"]:
        print(f"    motivos: {'; '.join(ver['motivos'])}")

    # 4) A ARTE não é gerada aqui — vai pela orchestrator.art (Diretor de Arte + Art QC +
    #    Capa Visão) no build_platforms. O hero_prompt do Carrossel é ignorado de propósito
    #    (bypassava o QC e produzia a foto proibida). Ver docs/AUDITORIA-CTO.md.
    out = OUTPUTS / args.slug
    out.mkdir(parents=True, exist_ok=True)

    # 5) grava outputs
    (out / "slides.json").write_text(json.dumps(car["slides"], ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "caption.txt").write_text(
        car["caption"] + "\n\n" + " ".join(car["hashtags"]) + "\n\n" + car["primeiro_comentario"] + "\n",
        encoding="utf-8")
    meta = {
        "dossie": args.slug, "formato": brief["formato"], "produto_id": brief["produto_id"],
        "relevancia_motivo": brief.get("relevancia_motivo", ""), "precisa_link": brief.get("precisa_link", False),
        "palavra_manychat": brief.get("palavra_manychat", ""),
        "link_afiliado": brief.get("link_afiliado", ""), "produto_titulo": brief.get("produto_titulo", ""),
        "cta": brief["cta_texto"], "caption": car["caption"], "hashtags": car["hashtags"],
        "tracked_url": f"{os.getenv('PORTAL_URL', 'https://alohabjjnews.com').rstrip('/')}/r/{args.slug}",
        "disclosure": brief["disclosure_texto"] if brief["disclosure_obrigatorio"] else None,
        "is_ai_generated": True,
        "quality": {"nota": ver["nota"], "aprovado": ver["aprovado"]},
        "estado": "aprovado" if ver["aprovado"] else "rejeitado",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # dual-write da peça no Supabase (no-op sem credencial)
    try:
        from lib import db
        db.upsert_piece({
            "slug": args.slug, "formato": brief["formato"], "produto_id": brief["produto_id"],
            "relevancia_motivo": brief.get("relevancia_motivo"), "precisa_link": brief.get("precisa_link", False),
            "link_afiliado": brief.get("link_afiliado") or None, "produto_titulo": brief.get("produto_titulo") or None,
            "cta": brief["cta_texto"], "caption": car["caption"], "hashtags": car["hashtags"],
            "is_ai_generated": True, "quality_nota": ver["nota"], "quality_aprovado": ver["aprovado"],
            "estado": "aprovado" if ver["aprovado"] else "rejeitado", "slides": car["slides"],
            "artifact_path": f"outputs/{args.slug}/",
        })
    except Exception:  # noqa: BLE001
        pass

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
