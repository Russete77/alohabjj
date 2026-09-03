"""
orchestrator/classify_editorias.py — sugere a editoria de cada dossiê.

POR QUE EXISTE: até a fase 5 a editoria era ADIVINHADA por um `if` — quando o
WordPress não dava categoria útil e o dossiê tinha atleta, caía em "superlutas".
O resultado é o acervo inteiro empilhado numa editoria só, e três das quatro
seções do portal vazias.

Agora a coluna do banco vence o palpite, mas alguém precisa preenchê-la. Este
passo lê o que o dossiê realmente diz e propõe a editoria — o operador revisa
uma lista em vez de decidir 43 vezes do zero.

Uma chamada em LOTE (Haiku): classificar é decidir, não escrever, e decidir em
lote custa uma fração de 43 chamadas.

Uso:
    python -m orchestrator.classify_editorias            # só mostra a proposta
    python -m orchestrator.classify_editorias --aplicar  # grava no banco
    python -m orchestrator.classify_editorias --todos    # inclui não publicados
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib import config_store  # noqa: E402
from lib.claude import Claude, SpendCapExceeded  # noqa: E402
from lib.dossier_index import read_all  # noqa: E402
from lib.jobs import JobLog  # noqa: E402
from lib.modelos import modelo_de  # noqa: E402
from lib.porteiro import normaliza_tag  # noqa: E402

EDITORIAS = {
    "superlutas": "confronto entre atletas nomeados — a matéria É a luta",
    "noticias": "fato novo: resultado de evento, anúncio, contratação, lesão, retorno",
    "analises": "leitura de contexto — legado, comparação, o que aquilo significa",
    "tecnica": "ensina algo: drill, erro comum, segurança, leitura de jogo",
}

# ── Classificação SEM IA ───────────────────────────────────────────────────
# O Analista já etiquetou cada dossiê quando o escreveu: 27 dos 43 carregam a
# tag "superluta", outros trazem "analise-tecnica" ou "conteudo-educativo".
# Esse sinal é melhor que o `if` que adivinhava pela presença de atleta — e não
# custa nada. Serve como base; a passada com IA refina quando houver crédito.

ENSINA = {"conteudo-educativo", "didatico", "drill", "fundamentos", "seguranca",
          "prevencao", "tecnica", "licao", "erro-comum", "mobilidade"}
ANALISA = {"analise-tecnica", "analise", "legado", "retrospectiva", "comparacao",
           "choque-de-estilos", "classico", "historia"}
CONFRONTO = {"superluta", "superlutas", "duelo", "final"}
FATO = {"noticia", "noticias", "resultado", "resultados", "anuncio", "lesao", "retorno"}


def classifica_por_tags(d: dict) -> tuple[str, str]:
    """Editoria + motivo, a partir do que o Analista etiquetou.

    Precedência deliberada: ENSINAR vence tudo (uma matéria que ensina é técnica
    mesmo citando atletas), depois CONFRONTO, depois FATO, e análise por último
    porque "análise-técnica" aparece como tag secundária em muita cobertura de
    luta — se ela viesse antes, esvaziaria superlutas.
    """
    tags = {normaliza_tag(t) for t in d.get("tags") or []}
    titulo = d["titulo"].lower()

    if tags & ENSINA:
        return "tecnica", f"tag {sorted(tags & ENSINA)[0]}"
    if not d.get("atletas") and any(x in titulo for x in ("como ", "por que", "quando ", "erro")):
        return "tecnica", "título ensina, sem atleta"
    # " vs " no título só vale com atleta NOMEADO: "Leve vs Pesado no Jiu-Jitsu"
    # é comparação conceitual, não luta — a heurística sozinha errava nela.
    if tags & CONFRONTO and d.get("atletas"):
        return "superlutas", f"tag {sorted(tags & CONFRONTO)[0]}"
    if d.get("atletas") and (" vs " in titulo or " x " in titulo):
        return "superlutas", "confronto entre atletas nomeados"
    if tags & FATO or any(x in titulo for x in ("results", "resultado", "anuncia", "volta")):
        return "noticias", f"tag {sorted(tags & FATO)[0]}" if tags & FATO else "título é fato novo"
    if tags & ANALISA:
        return "analises", f"tag {sorted(tags & ANALISA)[0]}"
    # Sobrou: sem tag de confronto e sem atleta nomeado. Se fala do esporte em
    # abstrato, é análise; se tem atleta, é cobertura.
    return ("superlutas", "tem atleta") if d.get("atletas") else ("analises", "assunto sem atleta")


SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"itens": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "i": {"type": "integer"},
            "editoria": {"type": "string", "enum": list(EDITORIAS)},
            "motivo": {"type": "string"},
        },
        "required": ["i", "editoria", "motivo"]}}},
    "required": ["itens"],
}


def _publicados() -> set[str]:
    import os
    u = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    k = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    req = urllib.request.Request(
        f"{u}/rest/v1/dossiers?select=slug&status=eq.published",
        headers={"apikey": k, "Authorization": f"Bearer {k}"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return {x["slug"] for x in json.loads(r.read())}


def _grava(slug: str, editoria: str) -> bool:
    import os
    u = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    k = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    req = urllib.request.Request(
        f"{u}/rest/v1/dossiers?slug=eq.{slug}", method="PATCH",
        data=json.dumps({"categoria": editoria}).encode(),
        headers={"apikey": k, "Authorization": f"Bearer {k}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status < 300
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="grava as sugestões no banco")
    ap.add_argument("--todos", action="store_true", help="inclui os não publicados")
    ap.add_argument("--sem-ia", action="store_true",
                    help="classifica pelas tags do Analista, sem gastar API")
    args = ap.parse_args()

    todos = read_all()
    if not args.todos:
        pub = _publicados()
        todos = [d for d in todos if d["slug"] in pub]
    if not todos:
        print("[editorias] nenhum dossiê pra classificar.")
        return 0

    linhas = []
    for i, d in enumerate(todos):
        resumo = " ".join(d["resumoParas"])[:260]
        atletas = ", ".join(d["atletas"][:3]) or "—"
        linhas.append(f"{i}. {d['titulo']}\n   atletas: {atletas} · evento: {d['evento'] or '—'}\n   {resumo}")

    if args.sem_ia:
        prop = {i: {"i": i, **dict(zip(("editoria", "motivo"), classifica_por_tags(d)))}
                for i, d in enumerate(todos)}
        return _relatorio(todos, prop, args.aplicar, custo=0.0)

    regras = "\n".join(f"- {k}: {v}" for k, v in EDITORIAS.items())
    log = JobLog(prefix="editorias")
    try:
        claude = Claude(log=log)
    except RuntimeError as e:
        print(f"[editorias] {e}")
        return 1

    try:
        txt, _ = claude.call(
            model=modelo_de("editoria"),
            system=(
                "Você classifica matérias de Jiu-Jitsu nas quatro editorias do portal "
                "AlohaBJJ. Responda SÓ o JSON do contrato.\n\n"
                f"EDITORIAS:\n{regras}\n\n"
                "Regra de desempate, nesta ordem:\n"
                "1. Se ensina algo ao leitor (drill, erro, segurança) → tecnica, mesmo "
                "que cite atletas.\n"
                "2. Se o assunto É um confronto entre atletas nomeados → superlutas.\n"
                "3. Se é fato novo (resultado, anúncio, lesão, retorno) → noticias.\n"
                "4. Se é leitura de contexto ou legado → analises.\n\n"
                "O `motivo` tem no máximo 8 palavras e diz o que fez você escolher."
            ),
            user="Classifique cada item:\n\n" + "\n\n".join(linhas),
            step="editoria", key="lote", json_schema=SCHEMA, max_tokens=4000)
    except SpendCapExceeded as e:
        print(f"[editorias] PARADO: {e}")
        return 1

    prop = {x["i"]: x for x in json.loads(txt).get("itens", [])}
    return _relatorio(todos, prop, args.aplicar, custo=log.total_cost())


def _relatorio(todos: list, prop: dict, aplicar: bool, custo: float) -> int:
    mudam = [(todos[i], p) for i, p in prop.items()
             if i < len(todos) and p["editoria"] != todos[i]["categoria"]]
    iguais = len(prop) - len(mudam)

    print(f"\n{'':2} {'ATUAL':<11} {'→':^3} {'PROPOSTA':<11}  TÍTULO")
    print("─" * 96)
    for d, p in sorted(mudam, key=lambda x: x[1]["editoria"]):
        print(f"   {d['categoria']:<11} {'→':^3} {p['editoria']:<11}  {d['titulo'][:52]}")
        print(f"   {'':11} {'':3} {'':11}  ↳ {p['motivo']}")

    from collections import Counter
    depois = Counter(p["editoria"] for p in prop.values())
    antes = Counter(d["categoria"] for d in todos)
    print("\nDISTRIBUIÇÃO")
    for e in EDITORIAS:
        print(f"  {e:<11} {antes.get(e,0):>3}  →  {depois.get(e,0):>3}")
    print(f"\n{len(mudam)} mudam · {iguais} já corretos · custo ≈ ${custo:.4f}")

    if not aplicar:
        print("\n[editorias] nada foi gravado. Use --aplicar pra valer.")
        return 0

    ok = sum(1 for d, p in mudam if _grava(d["slug"], p["editoria"]))
    print(f"[editorias] {ok}/{len(mudam)} gravado(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
