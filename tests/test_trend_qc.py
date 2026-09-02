"""
A separação entre chamar o modelo e aplicar o veredito é de propósito: aplicar
é lógica pura e testável sem gastar API.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator.scout_trends import aplicar_qc

TENDENCIAS = [
    {"titulo": "Food Jutsu (Jujutsu Kaisen)"},
    {"titulo": "Trap Motivacional do Tatame"},
    {"titulo": "ADCC Highlights"},
]


def test_reprovada_sai_da_lista():
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [
        {"i": 0, "aprovado": False, "motivo": "meme de anime"},
        {"i": 1, "aprovado": True, "motivo": "áudio de edit de BJJ"},
        {"i": 2, "aprovado": True, "motivo": "evento do nicho"},
    ])
    assert [t["titulo"] for t in aprovadas] == ["Trap Motivacional do Tatame", "ADCC Highlights"]
    assert reprovadas[0]["motivo"] == "meme de anime"


def test_sem_avaliacao_reprova():
    """Falhar fechado: tendência que o QC não avaliou não passa."""
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [{"i": 0, "aprovado": True, "motivo": "ok"}])
    assert [t["titulo"] for t in aprovadas] == ["Food Jutsu (Jujutsu Kaisen)"]
    assert len(reprovadas) == 2


def test_lista_de_avaliacoes_vazia_reprova_tudo():
    aprovadas, reprovadas = aplicar_qc(TENDENCIAS, [])
    assert aprovadas == []
    assert len(reprovadas) == 3


def test_indice_fora_da_faixa_e_ignorado():
    aprovadas, _ = aplicar_qc(TENDENCIAS, [{"i": 99, "aprovado": True, "motivo": "?"}])
    assert aprovadas == []
