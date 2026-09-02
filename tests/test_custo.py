"""
tests/test_custo.py — Tetos de gasto, medição de cache e allowlist da busca web.

Três defeitos reais que estes testes travam:

1. O teto diário era ficção. `DAILY_SPEND_CAP_USD` aparecia no painel /admin/custos
   como se fosse limite, mas nenhum código Python lia a variável. O teto de verdade
   era só por run (`SPEND_CAP_USD=5`): dez runs no mesmo dia gastavam cinquenta
   dólares sem nada barrar, porque cada JobLog só somava o PRÓPRIO arquivo.

2. O cache de prompt não era medido. `_cost()` calculava cache_read/cache_write e
   jogava fora — `record()` nunca via esses números. Sem eles é impossível saber se
   o prompt caching (a maior alavanca de custo do projeto) está funcionando.

3. A busca web não tinha allowlist. `research()` usava web_search sem
   `allowed_domains`: a curadoria de `config/fontes.yaml` valia só pro RSS e o
   Pesquisador podia apurar em qualquer canto e citar como fonte. Num nicho onde
   nome e graduação de atleta importam, isso é risco de marca.

Nada aqui gasta API: o cliente Anthropic é substituído por um dublê.
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import claude, jobs

# Timestamps ancorados ao MEIO-DIA local: o teste não vira de dia no meio da execução.
_HOJE = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
TS_HOJE = _HOJE.timestamp()
TS_ONTEM = (_HOJE - timedelta(days=1)).timestamp()


def _linha(path: Path, *, custo: float, ts: float | None = TS_HOJE, status: str = "succeeded") -> None:
    """Escreve uma linha de log igual à que o JobLog grava."""
    entry: dict = {"step": "analista", "status": status, "cost_est": custo}
    if ts is not None:
        entry["ts"] = ts
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


@pytest.fixture
def jobs_dir(tmp_path, monkeypatch):
    """Isola os logs num tmp e zera o cache em memória antes e depois."""
    d = tmp_path / "jobs"
    d.mkdir()
    monkeypatch.setattr(jobs, "JOBS_DIR", d)
    jobs.limpar_cache_custo()
    yield d
    jobs.limpar_cache_custo()


# ───────────────────────── dublê do SDK Anthropic ─────────────────────────────
class _Uso:
    def __init__(self, in_tok=1000, out_tok=200, c_read=0, c_write=0):
        self.input_tokens = in_tok
        self.output_tokens = out_tok
        self.cache_read_input_tokens = c_read
        self.cache_creation_input_tokens = c_write


class _Bloco:
    type = "text"

    def __init__(self, text: str):
        self.text = text


class _Msg:
    def __init__(self, uso: _Uso, texto="resposta"):
        self.usage = uso
        self.content = [_Bloco(texto)]
        self.stop_reason = "end_turn"


class _Messages:
    def __init__(self, msg: _Msg):
        self._msg = msg
        self.chamadas: list[dict] = []

    def create(self, **kw):
        self.chamadas.append(kw)
        return self._msg


class _ClienteFalso:
    def __init__(self, msg: _Msg):
        self.messages = _Messages(msg)


@pytest.fixture
def cliente(jobs_dir, monkeypatch):
    """Fábrica de Claude com cliente dublê — nenhuma chamada sai pra rede."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-de-teste-nao-usada")

    def _build(*, c_read=0, c_write=0, teto_run=100.0, teto_dia=100.0):
        c = claude.Claude(log=jobs.JobLog(run_id="teste"),
                          spend_cap_usd=teto_run, daily_cap_usd=teto_dia)
        c.client = _ClienteFalso(_Msg(_Uso(c_read=c_read, c_write=c_write)))
        return c

    return _build


def _linhas_do_log(jobs_dir: Path) -> list[dict]:
    txt = (jobs_dir / "teste.jsonl").read_text(encoding="utf-8")
    return [json.loads(l) for l in txt.splitlines() if l.strip()]


# ═══════════════════ 1) teto diário: custo_do_dia() ═══════════════════════════
def test_soma_so_o_dia_corrente(jobs_dir):
    _linha(jobs_dir / "hoje.jsonl", custo=1.5)
    _linha(jobs_dir / "ontem.jsonl", custo=9.0, ts=TS_ONTEM)
    assert jobs.custo_do_dia() == pytest.approx(1.5)


def test_soma_atravessa_runs_diferentes(jobs_dir):
    """O defeito em uma linha: 10 runs de $5 no mesmo dia = $50 e ninguém barrava."""
    for i in range(10):
        _linha(jobs_dir / f"run-{i}.jsonl", custo=5.0)
    assert jobs.custo_do_dia() == pytest.approx(50.0)


def test_sem_pasta_de_jobs_o_dia_e_zero(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "JOBS_DIR", tmp_path / "nao-existe")
    jobs.limpar_cache_custo()
    assert jobs.custo_do_dia() == 0.0


def test_cache_enxerga_linha_nova_no_mesmo_arquivo(jobs_dir):
    """O cache não pode CONGELAR o gasto — gastar mais tem que aparecer na hora."""
    p = jobs_dir / "run.jsonl"
    _linha(p, custo=1.0)
    assert jobs.custo_do_dia() == pytest.approx(1.0)
    _linha(p, custo=2.0)
    assert jobs.custo_do_dia() == pytest.approx(3.0)


def test_cache_enxerga_arquivo_novo(jobs_dir):
    _linha(jobs_dir / "a.jsonl", custo=1.0)
    assert jobs.custo_do_dia() == pytest.approx(1.0)
    _linha(jobs_dir / "b.jsonl", custo=4.0)  # outro run começou depois
    assert jobs.custo_do_dia() == pytest.approx(5.0)


def test_cache_nao_rele_arquivo_inalterado(jobs_dir, monkeypatch):
    """A razão de existir do cache: já_teve_sucesso() relê tudo e isso vai degradar."""
    for i in range(3):
        _linha(jobs_dir / f"r{i}.jsonl", custo=0.5)
    aberturas: list[str] = []
    original = Path.open

    def espiao(self, *a, **kw):
        aberturas.append(self.name)
        return original(self, *a, **kw)

    monkeypatch.setattr(Path, "open", espiao)
    jobs.custo_do_dia()
    n = len(aberturas)
    assert n >= 3  # primeira passada leu os arquivos
    jobs.custo_do_dia()
    assert len(aberturas) == n  # segunda não abriu nada: nada mudou


def test_arquivo_truncado_recalcula_do_zero(jobs_dir):
    """Se o arquivo encolheu, o offset guardado é lixo — refaz a conta."""
    p = jobs_dir / "run.jsonl"
    for _ in range(3):
        _linha(p, custo=2.0)
    assert jobs.custo_do_dia() == pytest.approx(6.0)
    p.write_text("", encoding="utf-8")
    _linha(p, custo=1.0)
    assert jobs.custo_do_dia() == pytest.approx(1.0)


def test_linha_pela_metade_nao_e_perdida(jobs_dir):
    """Escrita interrompida no meio: a linha entra na conta quando completar."""
    p = jobs_dir / "run.jsonl"
    _linha(p, custo=1.0)
    with p.open("a", encoding="utf-8") as f:
        f.write('{"ts": ' + str(TS_HOJE) + ', "cost_est": 2.0')  # sem \n ainda
    assert jobs.custo_do_dia() == pytest.approx(1.0)
    with p.open("a", encoding="utf-8") as f:
        f.write("}\n")
    assert jobs.custo_do_dia() == pytest.approx(3.0)


def test_linha_com_custo_e_sem_ts_conta_no_dia(jobs_dir):
    """Falhar fechado: custo que não dá pra datar entra no dia, não some da conta."""
    _linha(jobs_dir / "run.jsonl", custo=3.0, ts=None)
    assert jobs.custo_do_dia() == pytest.approx(3.0)


def test_linha_corrompida_nao_derruba_a_soma(jobs_dir):
    p = jobs_dir / "run.jsonl"
    _linha(p, custo=1.0)
    with p.open("a", encoding="utf-8") as f:
        f.write("isto não é json\n")
    _linha(p, custo=2.0)
    assert jobs.custo_do_dia() == pytest.approx(3.0)


# ═══════════════════ 1b) o teto diário barrando de verdade ════════════════════
def test_call_bloqueia_quando_o_dia_estourou(cliente, jobs_dir):
    _linha(jobs_dir / "outro-run.jsonl", custo=25.0)
    c = cliente(teto_dia=20.0)
    with pytest.raises(claude.SpendCapExceeded) as e:
        c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    assert "dia" in str(e.value).lower()
    assert c.client.messages.chamadas == []  # não chegou a gastar


def test_research_bloqueia_quando_o_dia_estourou(cliente, jobs_dir):
    _linha(jobs_dir / "outro-run.jsonl", custo=25.0)
    c = cliente(teto_dia=20.0)
    with pytest.raises(claude.SpendCapExceeded):
        c.research(model=claude.HAIKU, system="s", user="u", step="pesquisador", key="k")
    assert c.client.messages.chamadas == []


def test_call_passa_abaixo_do_teto_diario(cliente, jobs_dir):
    _linha(jobs_dir / "outro-run.jsonl", custo=1.0)
    c = cliente(teto_dia=20.0)
    texto, _uso = c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    assert texto == "resposta"


def test_gasto_de_ontem_nao_bloqueia_hoje(cliente, jobs_dir):
    _linha(jobs_dir / "ontem.jsonl", custo=999.0, ts=TS_ONTEM)
    c = cliente(teto_dia=20.0)
    texto, _uso = c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    assert texto == "resposta"


def test_erro_ao_somar_o_dia_bloqueia(cliente, monkeypatch):
    """Falhar fechado: sem saber quanto já gastou, não gasta mais."""
    def explode(*_a, **_kw):
        raise OSError("disco fora do ar")

    monkeypatch.setattr(claude, "custo_do_dia", explode)
    c = cliente()
    with pytest.raises(claude.SpendCapExceeded) as e:
        c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    assert "disco fora do ar" in str(e.value)
    assert c.client.messages.chamadas == []


def test_teto_do_run_continua_valendo(cliente, jobs_dir):
    c = cliente(teto_run=1.0, teto_dia=1000.0)
    _linha(jobs_dir / "teste.jsonl", custo=2.0)  # o arquivo DESTE run
    with pytest.raises(claude.SpendCapExceeded) as e:
        c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    assert "run" in str(e.value).lower()


def test_teto_diario_vem_do_env(monkeypatch, jobs_dir):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-de-teste")
    monkeypatch.setenv("DAILY_SPEND_CAP_USD", "7")
    assert claude.Claude(log=jobs.JobLog(run_id="teste")).daily_cap == 7.0


def test_teto_diario_default_20(monkeypatch, jobs_dir):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-de-teste")
    monkeypatch.delenv("DAILY_SPEND_CAP_USD", raising=False)
    assert claude.Claude(log=jobs.JobLog(run_id="teste")).daily_cap == 20.0


# ═══════════════════ 2) medição do cache de prompt ════════════════════════════
def test_call_loga_tokens_de_cache(cliente, jobs_dir):
    c = cliente(c_read=9000, c_write=1200)
    c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    ok = [l for l in _linhas_do_log(jobs_dir) if l["status"] == "succeeded"][-1]
    assert ok["cache_read_tok"] == 9000
    assert ok["cache_write_tok"] == 1200


def test_research_loga_tokens_de_cache(cliente, jobs_dir):
    c = cliente(c_read=4000, c_write=300)
    c.research(model=claude.HAIKU, system="s", user="u", step="pesquisador", key="k")
    ok = [l for l in _linhas_do_log(jobs_dir) if l["status"] == "succeeded"][-1]
    assert ok["cache_read_tok"] == 4000
    assert ok["cache_write_tok"] == 300


def test_sem_cache_os_campos_nao_poluem_o_log(cliente, jobs_dir):
    """record() já limpa None; zero não vira ruído — mas o campo some, não mente."""
    c = cliente(c_read=0, c_write=0)
    c.call(model=claude.HAIKU, system="s", user="u", step="analista", key="k")
    ok = [l for l in _linhas_do_log(jobs_dir) if l["status"] == "succeeded"][-1]
    assert ok.get("cache_read_tok", 0) == 0


# ═══════════════════ 3) allowlist da busca web ════════════════════════════════
def test_host_perde_esquema_www_e_caminho():
    assert claude._host("https://www.bjjheroes.com/feed") == "bjjheroes.com"
    assert claude._host("https://grapplinginsider.com/") == "grapplinginsider.com"
    assert claude._host("tatame.com.br") == "tatame.com.br"
    assert claude._host("") is None
    assert claude._host(None) is None


def test_dominios_saem_do_fontes_yaml():
    d = claude.dominios_permitidos()
    assert "flograppling.com" in d
    assert "bjjheroes.com" in d
    assert all("/" not in x and not x.startswith("www.") for x in d)
    assert len(d) == len(set(d))  # sem repetido


def test_dominios_extras_por_env(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_EXTRA_DOMAINS", "ibjjf.com, https://www.adcombat.com/eventos")
    d = claude.dominios_permitidos()
    assert "ibjjf.com" in d
    assert "adcombat.com" in d


def test_fontes_ilegivel_devolve_vazio(monkeypatch, tmp_path):
    monkeypatch.setattr(claude, "FONTES", tmp_path / "nao-existe.yaml")
    monkeypatch.delenv("WEB_SEARCH_EXTRA_DOMAINS", raising=False)
    claude.dominios_permitidos.cache_clear()
    assert claude.dominios_permitidos() == []
    claude.dominios_permitidos.cache_clear()


def test_research_manda_allowed_domains(cliente):
    c = cliente()
    c.research(model=claude.HAIKU, system="s", user="u", step="pesquisador", key="k")
    tool = c.client.messages.chamadas[-1]["tools"][0]
    assert "flograppling.com" in tool["allowed_domains"]


def test_lista_vazia_nao_manda_allowed_domains_e_avisa(cliente, monkeypatch, capsys):
    """Busca aberta é melhor que busca quebrada — mas o aviso tem que aparecer."""
    monkeypatch.setattr(claude, "dominios_permitidos", lambda: [])
    c = cliente()
    c.research(model=claude.HAIKU, system="s", user="u", step="pesquisador", key="k")
    tool = c.client.messages.chamadas[-1]["tools"][0]
    assert "allowed_domains" not in tool
    saida = capsys.readouterr().out.lower()
    assert "aviso" in saida and "aberta" in saida


# ── Allowlist: o YouTube não pode entrar inteiro ────────────────────────────
# Os canais curados entram no fontes.yaml pela URL do feed RSS; extrair o host
# devolve "youtube.com" e liberaria o site todo como fonte de apuração. Decisão
# do dono (02/09): só os canais do fontes.yaml — e como allowed_domains filtra
# por domínio e não por caminho, o YouTube fica fora da busca e segue valendo
# como fonte de RSS.

def test_youtube_nao_entra_na_allowlist_de_busca():
    from lib.claude import dominios_permitidos
    dominios_permitidos.cache_clear()
    assert not any("youtube" in d for d in dominios_permitidos())


def test_allowlist_ainda_traz_as_fontes_de_verdade():
    from lib.claude import dominios_permitidos
    dominios_permitidos.cache_clear()
    d = dominios_permitidos()
    assert len(d) >= 10
    assert any("bjjheroes" in x for x in d)


def test_extra_domains_consegue_liberar_o_youtube_de_proposito():
    import os
    from lib.claude import dominios_permitidos
    os.environ["WEB_SEARCH_EXTRA_DOMAINS"] = "youtube.com"
    dominios_permitidos.cache_clear()
    try:
        assert "youtube.com" in dominios_permitidos()
    finally:
        os.environ.pop("WEB_SEARCH_EXTRA_DOMAINS", None)
        dominios_permitidos.cache_clear()
