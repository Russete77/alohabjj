"""
lib/config_store.py — a configuração editável mora no BANCO; o arquivo é semente.

O painel edita 23 prompts, catálogo, fontes, voz, regras, atletas e cursos. Até
a fase 3 isso era `fs.writeFileSync` num caminho que não existe na Vercel: a
edição falhava em silêncio e sumia no deploy seguinte.

A REGRA, numa frase: **o banco manda, o arquivo do git é semente.**

  • `read(path)`  — banco primeiro. Vazio? lê o arquivo, semeia e devolve.
  • `seed(path)`  — arquivo → banco, sobrescrevendo. SEMPRE explícito, nunca
                    automático (ver orchestrator/seed_config.py).
  • `diverged()`  — onde arquivo e banco discordam, pro run avisar no log.
  • `setting(k)`  — app_settings → os.environ → default.

Sem credencial de Supabase, tudo cai no arquivo e o fluxo local segue igual.
Banco fora do ar também: indisponibilidade NUNCA derruba o pipeline — o pior
caso é o comportamento de antes desta fase.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
_TIMEOUT = 10

# Tudo que o painel pode editar. Serve de lista para o `--all` do seed_config
# e para o aviso de divergência no início do run.
def paths_gerenciados(root: Path | None = None) -> list[str]:
    base = root or ROOT
    achados: list[str] = []
    ag = base / "agents"
    if ag.exists():
        achados += [f"agents/{d.name}/system.md" for d in sorted(ag.iterdir())
                    if (d / "system.md").exists()]
    for nome in ("catalogo.yaml", "fontes.yaml", "atletas.yaml",
                 "voz.md", "regras.md", "bjj-visual.md"):
        if (base / "config" / nome).exists():
            achados.append(f"config/{nome}")
    cursos = base / "config" / "cursos"
    if cursos.exists():
        achados += [f"config/cursos/{f.name}" for f in sorted(cursos.glob("*.yaml"))]
    return achados


def _habilitado() -> bool:
    return bool(_URL and _KEY)


def _headers(extra: dict | None = None) -> dict:
    return {"apikey": _KEY, "Authorization": f"Bearer {_KEY}",
            "Content-Type": "application/json", **(extra or {})}


def _db_get(path: str) -> dict | None:
    """Linha do app_config, ou None quando não existe. Levanta em erro de rede."""
    q = urllib.parse.quote(path, safe="")
    req = urllib.request.Request(
        f"{_URL}/rest/v1/app_config?path=eq.{q}&select=conteudo,content_hash",
        headers=_headers())
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        linhas = json.loads(r.read())
    return linhas[0] if linhas else None


def _db_put(path: str, conteudo: str, content_hash: str, updated_by: str | None = None) -> bool:
    req = urllib.request.Request(
        f"{_URL}/rest/v1/app_config?on_conflict=path", method="POST",
        data=json.dumps({"path": path, "conteudo": conteudo,
                         "content_hash": content_hash, "updated_by": updated_by}).encode(),
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}))
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return r.status < 300


def _db_setting(key: str) -> str | None:
    q = urllib.parse.quote(key, safe="")
    req = urllib.request.Request(
        f"{_URL}/rest/v1/app_settings?key=eq.{q}&select=valor", headers=_headers())
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        linhas = json.loads(r.read())
    return linhas[0]["valor"] if linhas else None


def _hash(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _do_arquivo(path: str, root: Path | None = None) -> str:
    f = (root or ROOT) / path
    if not f.exists():
        raise FileNotFoundError(f"config ausente no banco e no disco: {path}")
    return f.read_text(encoding="utf-8")


def read(path: str, root: Path | None = None) -> str:
    """Conteúdo valendo agora. Banco primeiro; vazio ou fora do ar → arquivo."""
    if _habilitado():
        try:
            linha = _db_get(path)
            if linha and linha.get("conteudo") is not None:
                return linha["conteudo"]
            # Ausente no banco: o arquivo é a semente. Gravamos pra próxima
            # leitura já vir do banco e pra o painel ter o que editar.
            conteudo = _do_arquivo(path, root)
            try:
                _db_put(path, conteudo, _hash(conteudo), updated_by="seed automático")
            except Exception:  # noqa: BLE001 — semear é conveniência, não requisito
                pass
            return conteudo
        except FileNotFoundError:
            raise
        except Exception:  # noqa: BLE001 — banco indisponível não derruba o run
            pass
    return _do_arquivo(path, root)


def seed(path: str, root: Path | None = None, updated_by: str = "seed_config") -> bool:
    """Empurra o arquivo por cima do banco. Explícito — apaga edição do painel."""
    if not _habilitado():
        return False
    conteudo = _do_arquivo(path, root)
    return _db_put(path, conteudo, _hash(conteudo), updated_by=updated_by)


def diverged(paths: list[str] | None = None, root: Path | None = None) -> list[str]:
    """Paths cujo conteúdo no banco difere do arquivo no git.

    Só olha o que JÁ está no banco: ausente não é divergente, é não-semeado.
    Nunca levanta — é usado no início do run só para avisar.
    """
    if not _habilitado():
        return []
    fora: list[str] = []
    for path in (paths if paths is not None else paths_gerenciados(root)):
        try:
            linha = _db_get(path)
            if not linha:
                continue
            if linha.get("conteudo") != _do_arquivo(path, root):
                fora.append(path)
        except Exception:  # noqa: BLE001
            continue
    return fora


def setting(key: str, default: str | None = None) -> str | None:
    """app_settings → os.environ → default.

    Valor vazio no banco conta como NÃO configurado: salvar um campo em branco
    no painel não pode apagar o que veio do ambiente.
    """
    if _habilitado():
        try:
            v = _db_setting(key)
            if v not in (None, ""):
                return v
        except Exception:  # noqa: BLE001
            pass
    return os.getenv(key) or default


def avisa_divergencia(root: Path | None = None) -> None:
    """Uma linha por path divergente, no início do run. Chamado pelo daily."""
    for path in diverged(root=root):
        print(f"[config] {path} difere do banco — o BANCO está valendo. "
              f"Use `python -m orchestrator.seed_config --file {path}` para empurrar o arquivo.")
