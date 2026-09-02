"""
A regra do config_store em uma frase: o banco manda, o arquivo é semente.

Estes testes não tocam a rede — o acesso ao banco é injetado por monkeypatch.
O que eles protegem é a PRECEDÊNCIA, que é onde um engano custa caro: se o
arquivo vencesse o banco, toda edição feita no painel seria silenciosamente
desfeita no próximo run.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import config_store as cs


@pytest.fixture
def repo(tmp_path):
    """Um repo de mentira com um prompt e um YAML."""
    (tmp_path / "agents" / "radar").mkdir(parents=True)
    (tmp_path / "agents" / "radar" / "system.md").write_text("prompt do arquivo", encoding="utf-8")
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "fontes.yaml").write_text("meta:\n  max_age_days: 21\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def banco(monkeypatch):
    """Banco em memória. Devolve o dict pra o teste inspecionar o que foi gravado."""
    linhas: dict[str, dict] = {}
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    monkeypatch.setattr(cs, "_db_get", lambda path: linhas.get(path))
    def _put(path, conteudo, content_hash, updated_by=None):
        linhas[path] = {"path": path, "conteudo": conteudo, "content_hash": content_hash}
        return True
    monkeypatch.setattr(cs, "_db_put", _put)
    return linhas


# ── precedência ────────────────────────────────────────────────────────────

def test_banco_vazio_le_arquivo_e_semeia(repo, banco):
    assert cs.read("agents/radar/system.md", root=repo) == "prompt do arquivo"
    assert banco["agents/radar/system.md"]["conteudo"] == "prompt do arquivo"


def test_banco_preenchido_vence_o_arquivo(repo, banco):
    banco["agents/radar/system.md"] = {"conteudo": "prompt EDITADO no painel", "content_hash": "x"}
    assert cs.read("agents/radar/system.md", root=repo) == "prompt EDITADO no painel"


def test_sem_banco_cai_no_arquivo(repo, monkeypatch):
    monkeypatch.setattr(cs, "_habilitado", lambda: False)
    assert cs.read("agents/radar/system.md", root=repo) == "prompt do arquivo"


def test_banco_fora_do_ar_cai_no_arquivo_sem_levantar(repo, monkeypatch):
    """Indisponibilidade do banco não pode derrubar o pipeline — o pior caso
    aceitável é o comportamento de antes desta fase (ler o arquivo)."""
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    def explode(_path):
        raise ConnectionError("banco fora do ar")
    monkeypatch.setattr(cs, "_db_get", explode)
    assert cs.read("agents/radar/system.md", root=repo) == "prompt do arquivo"


def test_arquivo_inexistente_e_banco_vazio_levanta(repo, banco):
    with pytest.raises(FileNotFoundError):
        cs.read("agents/nao-existe/system.md", root=repo)


# ── seed explícito ─────────────────────────────────────────────────────────

def test_seed_sobrescreve_o_banco_com_o_arquivo(repo, banco):
    banco["config/fontes.yaml"] = {"conteudo": "editado no painel", "content_hash": "x"}
    cs.seed("config/fontes.yaml", root=repo)
    assert banco["config/fontes.yaml"]["conteudo"] == "meta:\n  max_age_days: 21\n"


def test_read_nunca_sobrescreve_edicao_do_painel(repo, banco):
    """O contrário do seed: ler não pode desfazer o que o operador editou."""
    banco["config/fontes.yaml"] = {"conteudo": "editado no painel", "content_hash": "x"}
    cs.read("config/fontes.yaml", root=repo)
    assert banco["config/fontes.yaml"]["conteudo"] == "editado no painel"


# ── divergência ────────────────────────────────────────────────────────────

def test_diverged_aponta_o_que_difere(repo, banco):
    cs.read("agents/radar/system.md", root=repo)          # semeia igual
    banco["config/fontes.yaml"] = {"conteudo": "outra coisa", "content_hash": "velho"}
    div = cs.diverged(["agents/radar/system.md", "config/fontes.yaml"], root=repo)
    assert div == ["config/fontes.yaml"]


def test_diverged_ignora_path_que_nao_esta_no_banco(repo, banco):
    """Ainda não semeado não é divergente — é ausente."""
    assert cs.diverged(["config/fontes.yaml"], root=repo) == []


def test_diverged_nao_levanta_com_banco_fora(repo, monkeypatch):
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    def explode(_path):
        raise ConnectionError("fora do ar")
    monkeypatch.setattr(cs, "_db_get", explode)
    assert cs.diverged(["config/fontes.yaml"], root=repo) == []


# ── settings ───────────────────────────────────────────────────────────────

def test_setting_do_banco_vence_o_ambiente(monkeypatch):
    monkeypatch.setenv("SCOUT_MODEL", "haiku")
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    monkeypatch.setattr(cs, "_db_setting", lambda k: "sonnet" if k == "SCOUT_MODEL" else None)
    assert cs.setting("SCOUT_MODEL") == "sonnet"


def test_setting_cai_no_ambiente_quando_o_banco_nao_tem(monkeypatch):
    monkeypatch.setenv("SCOUT_MODEL", "haiku")
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    monkeypatch.setattr(cs, "_db_setting", lambda k: None)
    assert cs.setting("SCOUT_MODEL") == "haiku"


def test_setting_cai_no_default_quando_ninguem_tem(monkeypatch):
    monkeypatch.delenv("SCOUT_MODEL", raising=False)
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    monkeypatch.setattr(cs, "_db_setting", lambda k: None)
    assert cs.setting("SCOUT_MODEL", "haiku") == "haiku"


def test_setting_vazio_no_banco_nao_mascara_o_ambiente(monkeypatch):
    """String vazia no banco é 'não configurado', não 'configurado como nada' —
    senão salvar um campo em branco no painel apagaria o valor do ambiente."""
    monkeypatch.setenv("SCOUT_MODEL", "haiku")
    monkeypatch.setattr(cs, "_habilitado", lambda: True)
    monkeypatch.setattr(cs, "_db_setting", lambda k: "")
    assert cs.setting("SCOUT_MODEL") == "haiku"
