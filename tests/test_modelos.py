"""
Escolher o modelo por etapa é a alavanca de custo mais direta do projeto: o
Analista em Opus custa 5x o mesmo texto em Sonnet, e o Radar em Sonnet custaria
3x sem melhorar o corte de pauta.

Até aqui a escolha estava espalhada em 22 pontos do código. Estes testes travam
a regra do lugar único — e, principalmente, travam a FALHA SEGURA: config
errada nunca pode virar um modelo mais caro sem ninguém pedir.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import modelos
from lib.claude import HAIKU, OPUS, SONNET


@pytest.fixture(autouse=True)
def sem_banco(monkeypatch):
    """Por padrão os testes rodam sem config no banco — valem os padrões."""
    monkeypatch.setattr(modelos, "_config", lambda: {})
    modelos.limpar_cache()
    yield
    modelos.limpar_cache()


def test_padrao_de_cada_etapa_e_o_que_o_codigo_ja_usava():
    assert modelos.modelo_de("radar") is HAIKU
    assert modelos.modelo_de("pesquisador") is SONNET
    assert modelos.modelo_de("analista") is OPUS
    assert modelos.modelo_de("avaliador") is HAIKU
    assert modelos.modelo_de("carrossel") is SONNET


def test_config_troca_o_modelo_da_etapa(monkeypatch):
    monkeypatch.setattr(modelos, "_config", lambda: {"analista": "sonnet"})
    modelos.limpar_cache()
    assert modelos.modelo_de("analista") is SONNET
    assert modelos.modelo_de("radar") is HAIKU  # as outras não mudam


def test_nome_desconhecido_cai_no_padrao_e_nao_num_modelo_caro(monkeypatch):
    """Falha SEGURA: config com erro de digitação não pode promover a etapa pro
    modelo mais caro sem ninguém ter pedido."""
    monkeypatch.setattr(modelos, "_config", lambda: {"radar": "opuss"})
    modelos.limpar_cache()
    assert modelos.modelo_de("radar") is HAIKU


def test_etapa_desconhecida_usa_haiku():
    """Etapa nova que ninguém mapeou entra pelo mais barato, não pelo mais caro."""
    assert modelos.modelo_de("etapa-que-nao-existe") is HAIKU


def test_banco_fora_do_ar_nao_derruba_a_escolha(monkeypatch):
    def explode():
        raise ConnectionError("banco fora")
    monkeypatch.setattr(modelos, "_config", explode)
    modelos.limpar_cache()
    assert modelos.modelo_de("analista") is OPUS


def test_aceita_nome_com_maiuscula_e_espaco(monkeypatch):
    monkeypatch.setattr(modelos, "_config", lambda: {"analista": "  Sonnet "})
    modelos.limpar_cache()
    assert modelos.modelo_de("analista") is SONNET


def test_catalogo_expoe_as_etapas_com_o_padrao():
    cat = modelos.catalogo()
    nomes = {e["etapa"] for e in cat}
    assert {"radar", "pesquisador", "analista", "carrossel", "avaliador"} <= nomes
    analista = next(e for e in cat if e["etapa"] == "analista")
    assert analista["padrao"] == "opus"
    assert analista["atual"] == "opus"


def test_catalogo_marca_o_que_foi_trocado(monkeypatch):
    monkeypatch.setattr(modelos, "_config", lambda: {"analista": "haiku"})
    modelos.limpar_cache()
    analista = next(e for e in modelos.catalogo() if e["etapa"] == "analista")
    assert analista["atual"] == "haiku"
    assert analista["padrao"] == "opus"


def test_custo_relativo_ajuda_a_decidir():
    """A tela mostra o quanto a troca muda a conta — sem isso o operador escolhe
    no escuro. Lê-se "trocar X por Y multiplica a conta por N"."""
    assert modelos.custo_relativo("haiku", "opus") == pytest.approx(5.0)
    assert modelos.custo_relativo("opus", "haiku") == pytest.approx(0.2)
    assert modelos.custo_relativo("sonnet", "sonnet") == pytest.approx(1.0)
    # trocar o Analista de Opus pra Sonnet corta a conta daquela etapa em 40%
    assert modelos.custo_relativo("opus", "sonnet") == pytest.approx(0.6)
