"""
Testa a regra de bloqueio do porteiro. É lógica pura — sem banco, sem disco.

O caso que motivou o teste: o Analista grava tags em texto livre e acentuado.
O dossiê do André Galvão traz literalmente "tema sensível", com espaço e acento.
Comparar cru contra "tema-sensivel" deixaria a trava passar batido.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.porteiro import motivo_bloqueio, normaliza_tag


def test_normaliza_tira_acento_e_espaco():
    assert normaliza_tag("tema sensível") == "tema-sensivel"


def test_normaliza_troca_underscore_por_hifen():
    assert normaliza_tag("nao_confirmado") == "nao-confirmado"


def test_normaliza_e_idempotente():
    assert normaliza_tag("apuracao-incompleta") == "apuracao-incompleta"


def test_confianca_baixa_bloqueia():
    assert motivo_bloqueio({"confianca": "baixa", "tags": []}) == "confiança baixa"


def test_tag_acentuada_bloqueia():
    # o caso real do dossiê do André Galvão
    meta = {"confianca": "media", "tags": ["notícia", "André Galvão", "tema sensível"]}
    assert motivo_bloqueio(meta) == "tag de bloqueio: tema sensível"


def test_tag_de_apuracao_bloqueia():
    # o caso real do dossiê da Mariana Bucher
    meta = {"confianca": "media", "tags": ["nao-verificado", "apuracao-incompleta"]}
    assert motivo_bloqueio(meta) is not None


def test_dossie_limpo_nao_bloqueia():
    meta = {"confianca": "media", "tags": ["gi", "IBJJF", "faixa-preta"]}
    assert motivo_bloqueio(meta) is None


def test_metadata_vazio_nao_explode():
    assert motivo_bloqueio({}) is None


def test_confianca_ausente_com_tag_limpa_passa():
    assert motivo_bloqueio({"tags": ["no-gi"]}) is None
