"""
lib/modelos.py — qual modelo roda cada etapa, num lugar só.

Escolher o modelo por etapa é a alavanca de custo mais direta do projeto: o
Analista em Opus custa cerca de 5x o mesmo texto em Sonnet, e o Radar em Sonnet
custaria 3x sem cortar pauta melhor. A telemetria real mostra o Pesquisador
levando 36% do gasto sozinho.

Até aqui essa decisão estava espalhada em 22 pontos do código, cada um com o
modelo escrito na chamada. Agora vem de `config/modelos.json` (editável no
painel, banco manda) e o código pergunta pela ETAPA, não pelo modelo.

REGRA DE FALHA: na dúvida, o mais BARATO. Nome desconhecido cai no padrão da
etapa; etapa desconhecida cai em Haiku. Config errada nunca promove nada pro
modelo caro sem alguém ter pedido — o inverso torraria dinheiro em silêncio.
"""
from __future__ import annotations

import json

from lib.claude import HAIKU, OPUS, SONNET, Model

# O que o código já usava antes desta fase. Mudar aqui muda o padrão de fábrica;
# mudar no painel muda só a instalação do Lucas.
PADRAO: dict[str, str] = {
    # Fase A — inteligência
    "radar": "haiku",
    "dedupe": "haiku",
    "pesquisador": "sonnet",
    "validador": "sonnet",
    "analista": "opus",
    # Fase B — produção
    "supervisor": "sonnet",
    "carrossel": "sonnet",
    "avaliador": "haiku",
    "instagram": "sonnet",
    "tiktok": "sonnet",
    "facebook": "sonnet",
    "youtube": "sonnet",
    # Arte
    "diretor_arte": "sonnet",
    "art_qc": "haiku",
    "capa_visao": "haiku",
    # Estratégia e caçadores
    "trend_scout": "haiku",
    "trend_qc": "haiku",
    "content_strategist": "sonnet",
    "athlete_scout": "sonnet",
    "scout": "haiku",
    "ideator_3d": "haiku",
    "ideator_cursos": "haiku",
    # Produto próprio
    "course_builder": "opus",
    "build_dossier": "opus",
    "distill_voice": "opus",
}

_POR_NOME: dict[str, Model] = {"haiku": HAIKU, "sonnet": SONNET, "opus": OPUS}

# Rótulo pro painel: o que a etapa faz, em linguagem de dono.
ROTULOS: dict[str, str] = {
    "radar": "Radar — pontua e corta pauta fraca",
    "dedupe": "Dedupe — decide se a pauta é nova",
    "pesquisador": "Pesquisador — apura na web (o mais caro hoje)",
    "validador": "Validador — aplica a regra das 2 fontes",
    "analista": "Analista — escreve o dossiê",
    "supervisor": "Supervisor — casa a pauta com o produto",
    "carrossel": "Carrossel — escreve os slides",
    "avaliador": "Avaliador — barra peça fraca",
    "instagram": "Instagram — legenda e headlines",
    "tiktok": "TikTok — roteiro por beats",
    "facebook": "Facebook — pacote de comunidade",
    "youtube": "YouTube — metadados de Shorts",
    "diretor_arte": "Diretor de Arte — brief da imagem",
    "art_qc": "Art QC — olha a imagem e reprova",
    "capa_visao": "Capa — escolhe a headline olhando a foto",
    "trend_scout": "Trend Scout — o que está bombando",
    "trend_qc": "Trend QC — corta o que não é BJJ",
    "content_strategist": "Estrategista — calendário da semana",
    "athlete_scout": "Athlete Scout — perfil de atleta",
    "scout": "Product Scout — campeão do marketplace",
    "ideator_3d": "Ideador 3D — ideia de peça imprimível",
    "ideator_cursos": "Ideador de Cursos — tema e ementa",
    "course_builder": "Course Builder — currículo do curso",
    "build_dossier": "Analista (backfill) — dossiê a partir do acervo",
    "distill_voice": "Destilador de Voz — a voz da marca",
}

_CACHE: dict[str, str] | None = None


def limpar_cache() -> None:
    global _CACHE
    _CACHE = None


def _config() -> dict:
    """{etapa: nome_do_modelo} vindo de config/modelos.json. Pode levantar."""
    from lib import config_store

    bruto = config_store.read("config/modelos.json")
    dados = json.loads(bruto)
    return dados if isinstance(dados, dict) else {}


def _escolhas() -> dict[str, str]:
    global _CACHE
    if _CACHE is None:
        try:
            _CACHE = {str(k): str(v) for k, v in _config().items()}
        except Exception:  # noqa: BLE001 — sem config, valem os padrões
            _CACHE = {}
    return _CACHE


def modelo_de(etapa: str) -> Model:
    """O modelo que roda esta etapa agora. Nunca levanta; nunca encarece sozinho."""
    escolhido = _escolhas().get(etapa, "")
    m = _POR_NOME.get(str(escolhido).strip().lower())
    if m is not None:
        return m
    # Nome inválido ou ausente: cai no padrão DA ETAPA; etapa desconhecida cai
    # no mais barato. Nunca no mais caro.
    return _POR_NOME.get(PADRAO.get(etapa, "haiku"), HAIKU)


def nome_de(etapa: str) -> str:
    """O nome curto do modelo valendo agora (pro painel e pro log)."""
    m = modelo_de(etapa)
    for nome, mod in _POR_NOME.items():
        if mod is m:
            return nome
    return "haiku"


def custo_relativo(de: str, para: str) -> float:
    """Quantas vezes `para` custa em relação a `de` (média de entrada e saída).

    É o número que a tela mostra pro operador não escolher no escuro.
    """
    a, b = _POR_NOME.get(de, HAIKU), _POR_NOME.get(para, HAIKU)
    return ((b.in_per_mtok / a.in_per_mtok) + (b.out_per_mtok / a.out_per_mtok)) / 2


def catalogo() -> list[dict]:
    """Todas as etapas, com padrão, escolha atual e rótulo — pro painel."""
    return [
        {
            "etapa": etapa,
            "rotulo": ROTULOS.get(etapa, etapa),
            "padrao": padrao,
            "atual": nome_de(etapa),
            "trocado": nome_de(etapa) != padrao,
        }
        for etapa, padrao in PADRAO.items()
    ]
