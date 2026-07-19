"""
lib/storage.py — Supabase Storage (service key). Sobe as imagens do pipeline (hero dos
dossiês, slides e arte das peças) pra um bucket PÚBLICO e devolve a URL pública. Assim o
site/admin deployado mostra imagem — o disco local não vai junto pro Vercel.

Só usa a Storage API (REST) + service key; NÃO é DDL. Best-effort: nunca derruba o pipeline.

Uso:
    from lib import storage
    url = storage.upload("art", f"{slug}/story.png", Path(".../story.png"))
"""
from __future__ import annotations

import mimetypes
import os
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
_ENSURED: set[str] = set()


def enabled() -> bool:
    return bool(_URL and _KEY)


def _req(method: str, path: str, data: bytes | None = None, ctype: str | None = None,
         upsert: bool = False):
    headers = {"apikey": _KEY, "Authorization": f"Bearer {_KEY}"}
    if ctype:
        headers["Content-Type"] = ctype
    if upsert:
        headers["x-upsert"] = "true"
    req = urllib.request.Request(f"{_URL}/storage/v1/{path}", data=data, method=method, headers=headers)
    return urllib.request.urlopen(req, timeout=20)


def ensure_bucket(bucket: str, public: bool = True) -> bool:
    """Cria o bucket público se ainda não existe. Idempotente (só tenta 1x por processo)."""
    if not enabled() or bucket in _ENSURED:
        return enabled()
    try:
        _req("GET", f"bucket/{bucket}")
        _ENSURED.add(bucket)
        return True
    except Exception:  # noqa: BLE001 — não existe (ou erro): tenta criar
        pass
    try:
        import json
        body = json.dumps({"id": bucket, "name": bucket, "public": public}).encode()
        _req("POST", "bucket", data=body, ctype="application/json")
    except Exception:  # noqa: BLE001 — corrida/já existe: segue
        pass
    _ENSURED.add(bucket)
    return True


def public_url(bucket: str, path: str) -> str:
    return f"{_URL}/storage/v1/object/public/{bucket}/{path}"


def upload(bucket: str, path: str, file: Path) -> str | None:
    """Sobe (upsert) o arquivo e devolve a URL pública. None se falhar/desabilitado."""
    if not enabled() or not file.exists():
        return None
    ensure_bucket(bucket)
    ctype = mimetypes.guess_type(str(file))[0] or "application/octet-stream"
    try:
        _req("POST", f"object/{bucket}/{path}", data=file.read_bytes(), ctype=ctype, upsert=True)
        return public_url(bucket, path)
    except Exception:  # noqa: BLE001
        try:  # log discreto pra não sumir com a falha (igual db.py)
            import time
            (ROOT / "jobs").mkdir(exist_ok=True)
            with open(ROOT / "jobs" / "db-errors.log", "a", encoding="utf-8") as f:
                f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} storage {bucket}/{path}\n")
        except Exception:  # noqa: BLE001
            pass
        return None
