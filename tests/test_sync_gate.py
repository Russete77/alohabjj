"""
O snapshot é o que o portal serve quando não há disco (deploy). Se ele levar
não-publicado, o porteiro do lado web não adianta — o conteúdo chega por baixo.

Regra que este teste protege: FALHAR FECHADO. Banco fora do ar => snapshot
vazio, nunca snapshot completo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator import sync_to_cloud


def _dossie(slug: str, **extra) -> dict:
    base = {
        "slug": slug, "titulo": slug.upper(), "categoria": "noticias",
        "categoriaLabel": "Notícias", "atletas": [], "evento": "",
        "data": "2026-01-01", "resumoParas": [], "imagem": None,
        "fonteUrl": None, "confianca": "media", "tags": [],
    }
    base.update(extra)
    return base


def test_filtra_para_apenas_publicados():
    todos = [
        _dossie("a"),
        _dossie("b", confianca="baixa", tags=["nao-verificado"]),
    ]
    saida = sync_to_cloud.filtrar_publicados(todos, publicados={"a"})
    assert list(saida.keys()) == ["a"]


def test_banco_sem_resposta_gera_snapshot_vazio():
    """Falhar fechado: publicados=set() => nada vai ao ar."""
    assert sync_to_cloud.filtrar_publicados([_dossie("a", confianca="alta")], publicados=set()) == {}


def test_publicados_none_tambem_fecha():
    """None (erro de rede) não pode ser confundido com 'libera tudo'."""
    assert sync_to_cloud.filtrar_publicados([_dossie("a", confianca="alta")], publicados=None) == {}
