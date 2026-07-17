"""
lib/sources.py — Base de conhecimento que alimenta os agentes.

Mesmo manifesto que o /admin/conhecimento grava (knowledge/sources/index.json).
- text_for(agent): junta texto/link (e observações) das fontes marcadas p/ aquele
  agente (ou "all") num bloco pronto pra injetar no prompt.
- image_refs(): imagens de atleta já são copiadas p/ web/public/templates/refs/ na
  hora do upload, então o pipeline de arte (orchestrator/art.py) usa sem mudança.

Sem manifesto → funções devolvem vazio (nada quebra).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "knowledge" / "sources" / "index.json"
DIR = ROOT / "knowledge" / "sources"


def load() -> list[dict]:
    if not INDEX.exists():
        return []
    try:
        arr = json.loads(INDEX.read_text(encoding="utf-8"))
        return arr if isinstance(arr, list) else []
    except Exception:  # noqa: BLE001
        return []


def _scoped(agent: str) -> list[dict]:
    return [s for s in load() if agent in s.get("agents", []) or "all" in s.get("agents", [])]


def text_for(agent: str, *, max_chars: int = 6000) -> str:
    """Bloco de conhecimento (texto/link + observações) das fontes desse agente.
    Pronto pra concatenar no `user` do prompt. Vazio se não houver nada."""
    out: list[str] = []
    for s in _scoped(agent):
        t = s.get("type")
        title = s.get("title", "").strip()
        notes = (s.get("notes") or "").strip()
        if t == "link" and s.get("url"):
            out.append(f"- [{title}]({s['url']})" + (f" — {notes}" if notes else ""))
        elif t == "text":
            body = notes
            fn = s.get("filename")
            if not body and fn:
                fp = DIR / fn
                if fp.exists():
                    body = fp.read_text(encoding="utf-8").strip()
            if body:
                out.append(f"### {title}\n{body}")
        elif notes:  # imagem/áudio/vídeo com observação textual útil
            out.append(f"- ({t}) {title}: {notes}")
    if not out:
        return ""
    block = "\n\n".join(out)
    if len(block) > max_chars:
        block = block[:max_chars] + "\n… (truncado)"
    return "CONHECIMENTO DA MARCA (fontes cadastradas — use como referência):\n" + block


def has_any(agent: str) -> bool:
    return bool(_scoped(agent))
