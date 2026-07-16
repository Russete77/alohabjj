"""
lib/embeddings.py — Embeddings hospedados (dedupe semântico) com fallback léxico.

A Anthropic não tem modelo de embedding próprio (PRD §6), então o dedupe usa
embedding hospedado (Voyage recomendado; ou OpenAI). Se nenhuma chave estiver
disponível, cai num **fallback léxico grátis** (Jaccard de tokens) — o pipeline
roda mesmo sem chave, com precisão menor.

`similarity(a, b)` devolve 0..1. Usado pelo dedupe (§6).
"""
from __future__ import annotations

import math
import os
import re
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

_STOP = {"de", "da", "do", "e", "o", "a", "no", "na", "vs", "x", "the", "of", "in", "at"}


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOP and len(w) > 1}


def lexical_similarity(a: str, b: str) -> float:
    """Jaccard de tokens — fallback grátis quando não há embedding."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ---- embeddings hospedados (opcional) ----

def _voyage_embed(texts: list[str]) -> list[list[float]] | None:
    key = os.getenv("VOYAGE_API_KEY")
    if not key:
        return None
    import voyageai  # lazy

    client = voyageai.Client(api_key=key)
    return client.embed(texts, model=os.getenv("VOYAGE_MODEL", "voyage-3")).embeddings


def _openai_embed(texts: list[str]) -> list[list[float]] | None:
    if not os.getenv("OPENAI_API_KEY"):
        return None
    from openai import OpenAI  # lazy

    client = OpenAI()
    resp = client.embeddings.create(model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"), input=texts)
    return [d.embedding for d in resp.data]


def embed(texts: list[str]) -> list[list[float]] | None:
    """Retorna embeddings (Voyage > OpenAI) ou None se não houver chave."""
    return _voyage_embed(texts) or _openai_embed(texts)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def similarity(a: str, b: str) -> tuple[float, str]:
    """(score 0..1, método). Usa embedding hospedado se disponível; senão léxico."""
    vecs = embed([a, b])
    if vecs:
        return cosine(vecs[0], vecs[1]), "embedding"
    return lexical_similarity(a, b), "lexical"


def which() -> str:
    if os.getenv("VOYAGE_API_KEY"):
        return "voyage"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "lexical (sem chave de embedding)"
