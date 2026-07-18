"""
orchestrator/find_products.py — Fase 3: caçar produtos campeões pra Loja.

Pra cada CATEGORIA (query), busca o campeão real no marketplace (Amazon/ML/Shopee via
lib.affiliates), o Product Scout classifica + escreve a copy de conversão, e o candidato
vai pra data/product_candidates.json (+ Supabase). O Lucas aprova no /admin/produtos.

Sem credencial de afiliado → sem hit real; ainda gera candidato "precisa_link" (você cola
o link depois). Sem ANTHROPIC_API_KEY → --dry-run mostra o que faria.

Uso:
  python -m orchestrator.find_products --dry-run
  python -m orchestrator.find_products --max 6
  python -m orchestrator.find_products --query "rashguard no gi manga longa" --cat nogi
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.claude import Claude, SONNET, SpendCapExceeded  # noqa: E402
from lib.jobs import JobLog  # noqa: E402
from lib import candidates as cand  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / "agents"

# categorias-alvo padrão (query de marketplace + categoria/palavra ManyChat)
ALVOS = [
    ("kimono jiu jitsu competição trançado", "gi"),
    ("rashguard jiu jitsu no gi manga longa", "nogi"),
    ("faixa jiu jitsu premium", "gi"),
    ("luva grappling mma", "gear"),
    ("protetor bucal jiu jitsu", "gear"),
    ("joelheira jiu jitsu compressão", "gear"),
    ("tatame eva jiu jitsu", "gear"),
    ("mochila gear bag jiu jitsu", "gear"),
]

SCOUT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "id_sugerido": {"type": "string"}, "nome": {"type": "string"},
        "descricao": {"type": "string"}, "gancho": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "busca": {"type": "string"}, "cta_sugerido": {"type": "string"},
        "manychat_word": {"type": "string"}, "categoria": {"type": "string"},
        "tipo": {"type": "string"}, "score": {"type": "number"},
        "motivo": {"type": "string"}, "disclosure_obrigatorio": {"type": "boolean"},
    },
    "required": ["id_sugerido", "nome", "descricao", "gancho", "tags", "busca",
                 "cta_sugerido", "manychat_word", "categoria", "tipo", "score",
                 "motivo", "disclosure_obrigatorio"],
}


def _sys(name: str) -> str:
    return (AGENTS / name / "system.md").read_text(encoding="utf-8")


def _hit(query: str):
    """Campeão real do marketplace (ou None sem credencial)."""
    try:
        from lib import affiliates
        return affiliates.best_product(query)
    except Exception:  # noqa: BLE001
        return None


def _hit_dict(h) -> dict:
    if h is None:
        return {}
    if isinstance(h, dict):
        return h
    return {"titulo": getattr(h, "titulo", ""), "url": getattr(h, "url", ""),
            "fonte": getattr(h, "fonte", ""), "preco": getattr(h, "preco", ""),
            "imagem": getattr(h, "imagem", "")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=6, help="quantas categorias caçar")
    ap.add_argument("--query", help="query única (ad-hoc)")
    ap.add_argument("--cat", default="gear", help="categoria da query ad-hoc")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    alvos = [(args.query, args.cat)] if args.query else ALVOS[:args.max]
    print(f"[scout] {len(alvos)} categoria(s) a caçar")

    if args.dry_run:
        for q, c in alvos:
            h = _hit_dict(_hit(q))
            print(f"  faria: [{c}] '{q}' — hit: {h.get('titulo') or '(sem credencial de afiliado)'}")
        print("[scout] --dry-run: nenhuma chamada à IA.")
        return 0

    log = JobLog(prefix="scout")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[scout] {e}")
        return 1

    catalogo_sys = _sys("product_scout")
    ok = 0
    for q, c in alvos:
        h = _hit_dict(_hit(q))
        ctx = (f"CATEGORIA: {c}\nQUERY DE MERCADO: {q}\n\n"
               f"PRODUTO REAL ENCONTRADO:\n" +
               (json.dumps(h, ensure_ascii=False) if h else "(nenhum — sem credencial de afiliado; "
                "proponha o produto-tipo campeão e a query que o encontra)"))
        try:
            txt, _ = claude.call(model=SONNET, system=catalogo_sys,
                                 user=ctx, step="scout", key=q[:40],
                                 json_schema=SCOUT_SCHEMA, max_tokens=1200)
        except SpendCapExceeded as e:
            print(f"[scout] PARADO: {e}")
            break
        except Exception as e:  # noqa: BLE001
            print(f"  ! '{q}': {e}")
            continue
        data = json.loads(txt)
        data.update({
            "fonte": h.get("fonte", ""), "external_url": h.get("url", ""),
            "imagem_url": h.get("imagem", ""), "preco": h.get("preco", ""),
            "precisa_link": not h.get("url"),
        })
        cand.add(data)
        ok += 1
        print(f"  ✓ candidato: {data['id_sugerido']} (nota {data['score']}) "
              f"{'← ' + h['fonte'] if h.get('fonte') else '· precisa link'}")

    print(f"\n[scout] {ok} candidato(s) → data/product_candidates.json · custo ≈ ${log.total_cost():.4f}")
    print("        Aprove/reprove em /admin/produtos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
