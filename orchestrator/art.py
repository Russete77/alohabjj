"""
orchestrator/art.py — Pipeline de ARTE estruturado (Fase B).

Fluxo (decisão do Lucas: arte própria/IA, nunca repostar foto de terceiro):
  1. Diretor de Arte (Sonnet)  → brief técnico + prompt BJJ-correto (bjj-visual.md)
  2. imagegen (se houver chave) → gera o hero
  3. QC por visão (Haiku)       → o Claude OLHA: é BJJ? não é judô/íntimo? aberração? bate?
                                   reprovou → ajusta o prompt e regera (loop, evaluator-optimizer)
  4. headline coerente (visão)  → manchete honesta com o que a imagem mostra
  5. render_card                → card estilo notícia (foto + marca + Lucas)
  Sem chave de imagem OU arte reprovada → FRAME PRÓPRIO (story-frame + headline). Nunca foto de terceiro.

Exposto: art_for_piece(claude, slug, headlines, log) -> dict | None
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from lib.claude import Claude, SONNET, HAIKU, SpendCapExceeded
from lib.jobs import JobLog
from lib import imagegen

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
KNOWLEDGE = ROOT / "knowledge"
AGENTS = ROOT / "agents"
FRAME = ROOT / "web" / "public" / "templates" / "story-frame.jpeg"
LUCAS = ROOT / "web" / "public" / "templates" / "lucas.png"
REFS = ROOT / "web" / "public" / "templates" / "refs"   # fotos de referência por atleta (COM direito de uso)
WEB = ROOT / "web"


def _slugify(nome: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return "".join(c if c.isalnum() else "-" for c in s).strip("-")


def reference_for(protagonista: str) -> list[str]:
    """Fotos de referência do atleta na biblioteca (refs/<slug>.*). Só o que a marca tem direito.
    Sem match → lista vazia (aí a geração é sem semelhança específica)."""
    if not protagonista or not REFS.exists():
        return []
    slug = _slugify(protagonista)
    hits = [p for p in REFS.glob(f"{slug}*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    return [str(p) for p in sorted(hits)[:3]]


import re as _re  # noqa: E402
_URL = _re.compile(r"https?://[^\s)\]\"']+")


def _sources(slug: str) -> list[str]:
    """URLs de artigo do dossiê (metadata.source_url + facts) — imagem relacionada da web."""
    d = KNOWLEDGE / slug
    urls: list[str] = []
    mp = d / "metadata.json"
    if mp.exists():
        try:
            m = json.loads(mp.read_text(encoding="utf-8"))
            if isinstance(m.get("source_url"), str):
                urls.append(m["source_url"])
        except Exception:  # noqa: BLE001
            pass
    fp = d / "facts.md"
    if fp.exists():
        urls += _URL.findall(fp.read_text(encoding="utf-8"))
    seen, out = set(), []
    for u in urls:
        u = u.rstrip(".,;")
        if u.startswith("http") and u not in seen:
            seen.add(u); out.append(u)
    return out


def _sys(name: str) -> str:
    return (AGENTS / name / "system.md").read_text(encoding="utf-8")


ART_BRIEF_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "modo": {"type": "string", "enum": ["A", "B"]},
        "protagonista": {"type": "string"},        # atleta central da pauta ("" se genérica)
        "usar_referencia": {"type": "boolean"},     # recontextualizar preservando a semelhança dele?
        "posicao": {"type": "string"}, "traje": {"type": "string", "enum": ["gi", "nogi"]},
        "hero_prompt": {"type": "string"}, "needs_reference": {"type": "boolean"},
        "reference_hint": {"type": "string"},
        "ratio": {"type": "string", "enum": ["3:4", "4:5", "1:1", "16:9", "9:16"]},
        "motivo": {"type": "string"},
    },
    "required": ["modo", "protagonista", "usar_referencia", "posicao", "traje", "hero_prompt",
                 "needs_reference", "reference_hint", "ratio", "motivo"],
}

QC_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "ve_na_imagem": {"type": "string"}, "eh_bjj": {"type": "boolean"},
        "parece_judo": {"type": "boolean"}, "parece_intimo": {"type": "boolean"},
        "aberracao_ia": {"type": "boolean"}, "rosto_identificavel": {"type": "boolean"},
        "bate_conceito": {"type": "boolean"}, "serve_de_fundo": {"type": "boolean"},
        "nota": {"type": "integer"}, "aprovado": {"type": "boolean"},
        "problemas": {"type": "array", "items": {"type": "string"}},
        "ajuste_prompt": {"type": "string"},
    },
    "required": ["ve_na_imagem", "eh_bjj", "parece_judo", "parece_intimo", "aberracao_ia",
                 "rosto_identificavel", "bate_conceito", "serve_de_fundo", "nota", "aprovado",
                 "problemas", "ajuste_prompt"],
}

COHERENCE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"ve_na_foto": {"type": "string"}, "headline": {"type": "string"},
                   "veio_das_opcoes": {"type": "boolean"}},
    "required": ["ve_na_foto", "headline", "veio_das_opcoes"],
}
COHERENCE_SYS = (
    "Você é o Editor de Capa da AlohaBJJ. Regra inegociável: a headline NUNCA pode afirmar algo "
    "que a IMAGEM não mostra — não cite pessoa específica, sexo, resultado ou número que não dá pra ver."
)


def _resumo(slug: str) -> str:
    p = KNOWLEDGE / slug / "summary.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    cap = OUTPUTS / slug / "caption.txt"
    return cap.read_text(encoding="utf-8") if cap.exists() else slug


def art_brief(claude: Claude, resumo: str, headline_hint: str, slug: str) -> dict:
    """Diretor de Arte: brief técnico + prompt de imagem BJJ-correto."""
    visual = (ROOT / "config" / "bjj-visual.md").read_text(encoding="utf-8")
    user = (f"DOSSIÊ (resumo):\n{resumo[:1600]}\n\nHEADLINE/ÂNGULO PRETENDIDO: {headline_hint}\n\n"
            f"BASE VISUAL (obrigatória):\n{visual}\n\nProduza o brief da arte (modo A de ação atmosférica "
            "quando possível; modo B só se a peça exigir uma posição técnica exata).")
    txt, _ = claude.call(model=SONNET, system=_sys("art_director"), user=user,
                         step="diretor_arte", key=slug, json_schema=ART_BRIEF_SCHEMA,
                         effort="medium", max_tokens=1500)
    return json.loads(txt)


def qc_image(claude: Claude, image_path: Path, conceito: str, slug: str) -> dict:
    """QC por visão: o Claude olha a imagem e aprova/reprova (checagens eliminatórias)."""
    user = f"CONCEITO PEDIDO PELO DIRETOR: {conceito}\n\nOlhe a imagem e faça o QC conforme o contrato."
    txt, _ = claude.call(model=HAIKU, system=_sys("art_qc"), user=user, image=str(image_path),
                         step="art_qc", key=slug, json_schema=QC_SCHEMA, max_tokens=700)
    return json.loads(txt)


def coherent_headline(claude: Claude, image_path: Path, headlines: list[str], contexto: str,
                      slug: str) -> str:
    """Claude olha a arte final e escolhe/escreve a headline honesta com o que aparece."""
    user = ("Esta é a IMAGEM que vira a arte. Escolha, entre as OPÇÕES, a headline mais forte que seja "
            "HONESTA com o que aparece. Se nenhuma for honesta, ESCREVA uma curta e verdadeira (≤6 palavras).\n\n"
            "OPÇÕES:\n- " + "\n- ".join(headlines) + f"\n\nCONTEXTO: {contexto[:400]}")
    try:
        txt, _ = claude.call(model=HAIKU, system=COHERENCE_SYS, user=user, image=str(image_path),
                             step="capa_visao", key=slug, json_schema=COHERENCE_SCHEMA, max_tokens=500)
        return json.loads(txt)["headline"]
    except Exception:  # noqa: BLE001
        return headlines[0]


def generate_hero(claude: Claude, brief: dict, out_path: Path, slug: str,
                  references: list[str] | None = None, max_tries: int = 3) -> Path | None:
    """imagegen (+referências) + QC em loop. Regera com o ajuste do QC. None se sem chave/reprovado/teto."""
    if imagegen.which().startswith("nenhum"):
        return None
    prompt = brief["hero_prompt"]
    ratio = brief.get("ratio", "3:4")
    for attempt in range(1, max_tries + 1):
        if claude.log.total_cost() >= claude.spend_cap:
            print("  · teto de gasto atingido — arte IA abortada")
            return None
        try:
            imagegen.generate_image(prompt, out_path, ratio=ratio, references=references,
                                    log=claude.log, key=slug)
            v = qc_image(claude, out_path, brief["posicao"], slug)
        except SpendCapExceeded:
            print("  · teto de gasto na arte IA — cai pro frame próprio")
            return None
        except Exception as e:  # noqa: BLE001
            print(f"  ! imagegen/QC falhou: {e}")
            return None
        if v.get("aprovado"):
            print(f"  ✓ arte IA aprovada (nota {v.get('nota')}, tentativa {attempt}/{max_tries})")
            return out_path
        print(f"  ↻ QC reprovou (t{attempt}): “{v.get('ve_na_imagem','')[:55]}” → {v.get('ajuste_prompt','')[:55]}")
        if v.get("ajuste_prompt"):
            prompt = brief["hero_prompt"] + "  IMPORTANT ADJUSTMENT: " + v["ajuste_prompt"]
    print("  · arte IA reprovada em todas as tentativas — caindo pro frame próprio")
    return None


def _node(script: str, args: list[str], slug: str, log: JobLog, label: str) -> bool:
    try:
        r = subprocess.run(["node", script, *args], cwd=str(WEB),
                           capture_output=True, text=True, timeout=90)
        if r.returncode != 0:
            print(f"  ! {label} falhou: {r.stderr.strip() or r.stdout.strip()}")
            log.record("arte", "errored", key=slug, error=(r.stderr or r.stdout)[:200])
            return False
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  ! {label} falhou: {e}")
        return False


def art_for_piece(claude: Claude, slug: str, headlines: list[str], log: JobLog) -> dict | None:
    """Pipeline de arte completo. Retorna {source, headline, story} ou None."""
    out_dir = OUTPUTS / slug
    resumo = _resumo(slug)

    brief = art_brief(claude, resumo, headlines[0] if headlines else "", slug)
    print(f"  ✓ Diretor de Arte: modo {brief['modo']} · {brief['traje']} · “{brief['posicao'][:50]}”")

    import os as _os
    story = out_dir / "story.png"

    # 1) IMAGEM REAL do assunto (biblioteca própria OU web) — SEM IA. Caminho feliz.
    #    A gente JÁ busca a imagem; não faz sentido pagar IA pra "recriar". Pega e trata.
    src_img, credito = None, None
    if brief.get("protagonista"):
        r = reference_for(brief["protagonista"])
        if r:
            src_img, credito = r[0], "biblioteca"
            print(f"  ✓ imagem (biblioteca) de {brief['protagonista']}")
    if not src_img:
        try:
            from lib import heroimg
            hit = heroimg.hero_for(_sources(slug), out_dir / "ref_web.jpg")
            if hit:
                src_img, credito = str(hit["path"]), hit["credito"]
                print(f"  ✓ imagem (web · {credito}) do assunto — vai ser TRATADA, não gerada")
            else:
                print("  · sem imagem-fonte do assunto — cai no frame próprio")
        except Exception as e:  # noqa: BLE001
            print(f"  · busca de imagem web falhou ({e})")

    # 2) TRATAMENTO determinístico (sharp) → vira o fundo. Zero token de IA.
    hero_bg, source = None, None
    if src_img:
        enhanced = out_dir / "hero_bg.png"
        if _node("scripts/enhance.mjs",
                 ["--in", src_img, "--out", str(enhanced), "--w", "1080", "--h", "1350"],
                 slug, log, "enhance"):
            hero_bg, source = enhanced, "foto-tratada"
            print(f"  ✓ imagem tratada (grade editorial · nitidez · vinheta) ← {credito}")

    # 3) IA só como ÚLTIMO recurso e SÓ se explicitamente ligada (IMAGE_AI_FALLBACK=1)
    if not hero_bg and _os.getenv("IMAGE_AI_FALLBACK") == "1" \
            and brief["modo"] == "A" and not brief.get("needs_reference"):
        hero = generate_hero(claude, brief, out_dir / "hero_ia.png", slug, references=None)
        if hero:
            hero_bg, source = hero, "ia-bg"

    # 4) render com fundo; headline coerente por visão só no caso de IA (na foto real usa a 1ª)
    if hero_bg:
        headline = headlines[0] if headlines else slug
        if source == "ia-bg":
            headline = coherent_headline(claude, hero_bg, headlines, resumo, slug)
        ok = _node("scripts/render_story.mjs",
                   ["--headline", headline, "--bg", str(hero_bg), "--out", str(story)],
                   slug, log, "arte-fundo")
        if ok:
            # 9:16 (Stories/Reels): trata a MESMA foto no formato vertical + render 1080x1920
            story9 = out_dir / "story9x16.png"
            bg9 = out_dir / "hero_bg_9x16.png"
            has9 = _node("scripts/enhance.mjs",
                         ["--in", src_img or str(hero_bg), "--out", str(bg9), "--w", "1080", "--h", "1920"],
                         slug, log, "enhance-9x16") if src_img else False
            if has9:
                _node("scripts/render_story9x16.mjs",
                      ["--headline", headline, "--bg", str(bg9), "--out", str(story9)],
                      slug, log, "arte-9x16")
            # re-renderiza os SLIDES do carrossel com a MESMA foto tratada de fundo
            # (o build_carousel gerou teal; agora que temos a foto, ela entra no topo)
            if (out_dir / "slides.json").exists():
                _node("scripts/render_slides.mjs",
                      ["--slug", slug, "--bg", str(hero_bg)], slug, log, "slides-bg")
                print("  ✓ slides do carrossel re-renderizados com a foto de fundo")
            print(f"  ✓ arte ({source}) 4:5 + 9:16 ← “{headline}”")
            log.record("arte", "succeeded", key=slug, note=f"source={source} credito={credito or ''}")
            return {"source": source, "headline": headline, "story": "story.png",
                    "story9x16": "story9x16.png" if (out_dir / "story9x16.png").exists() else None,
                    "credito": credito}

    # 2) fallback: FRAME PRÓPRIO (nunca foto de terceiro)
    headline = headlines[0] if headlines else slug
    if FRAME.exists():
        ok = _node("scripts/render_story.mjs",
                   ["--headline", headline, "--out", str(story), "--frame", str(FRAME)],
                   slug, log, "frame")
        if ok:
            story9 = out_dir / "story9x16.png"
            _node("scripts/render_story9x16.mjs",
                  ["--headline", headline, "--out", str(story9), "--frame", str(FRAME)],
                  slug, log, "frame-9x16")
            motivo = "sem imagem-fonte" if imagegen.which().startswith("nenhum") else "arte IA off/modo B"
            print(f"  ✓ frame próprio 4:5 + 9:16 ({motivo}) ← “{headline}”")
            log.record("arte", "succeeded", key=slug, note="source=frame")
            return {"source": "frame", "headline": headline, "story": "story.png",
                    "story9x16": "story9x16.png" if (out_dir / "story9x16.png").exists() else None}

    print("  · nenhuma arte gerada (sem frame e sem IA)")
    return None
