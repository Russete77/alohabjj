"""
lib/porteiro.py — a regra de quem pode ir ao ar.

Lógica PURA, sem I/O: recebe o metadata de um dossiê e diz se publicar exige
confirmação extra do operador. Consumida pelo sync_to_cloud (snapshot) e
espelhada em web/lib/porteiro.ts (portal). As duas metades existem de
propósito e as duas são testadas — testar só uma deixa a outra livre pra vazar.

Regra da casa: falhar FECHADO. Na dúvida, bloqueia.
"""
from __future__ import annotations

import unicodedata

# Tags que o Analista usa quando a apuração não fechou. Comparadas JÁ normalizadas.
TAGS_BLOQUEIO = {
    "nao-verificado",
    "apuracao-incompleta",
    "pendente",
    "nao-confirmado",
    "tema-sensivel",
    "rumor",
}


def normaliza_tag(tag: str) -> str:
    """'tema sensível' -> 'tema-sensivel'.

    Minúscula, sem acento, espaço e underscore viram hífen. As tags vêm do
    modelo em texto livre; sem isso a comparação não casa.
    """
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", str(tag))
        if unicodedata.category(c) != "Mn"
    )
    return "-".join(sem_acento.lower().split()).replace("_", "-")


def motivo_bloqueio(meta: dict) -> str | None:
    """Por que publicar este dossiê exige confirmação extra — ou None se está limpo.

    A string devolvida vai pra tela do operador, então cita a tag ORIGINAL
    (acentuada), não a normalizada.
    """
    if str((meta or {}).get("confianca", "")).lower() == "baixa":
        return "confiança baixa"
    for tag in (meta or {}).get("tags") or []:
        if normaliza_tag(tag) in TAGS_BLOQUEIO:
            return f"tag de bloqueio: {tag}"
    return None
