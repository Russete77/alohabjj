#!/usr/bin/env python3
"""
ingestion/resolve_channels.py

Preenche os `channel_id` (e monta o `rss`) de todos os canais de YouTube em
config/fontes.yaml a partir do `youtube_handle`. Roda uma vez (ou quando você
adicionar canais novos). Preserva comentários do YAML (usa ruamel.yaml).

Uso:
    pip install requests ruamel.yaml
    python ingestion/resolve_channels.py config/fontes.yaml

O que faz:
- Para cada item com `youtube_handle` e `channel_id: null`, busca a página do
  canal, extrai o channelId (UC...) e grava channel_id + rss no arquivo.
- Idempotente: pula quem já tem channel_id.
- Falha graciosa: se não resolver um handle, deixa null e loga o aviso.
"""

import re
import sys
import time
import requests
from ruamel.yaml import YAML

RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# padrões, em ordem de confiança, para extrair o UC... da página do canal
PATTERNS = [
    re.compile(r'"channelId":"(UC[0-9A-Za-z_-]{22})"'),
    re.compile(r'"externalId":"(UC[0-9A-Za-z_-]{22})"'),
    re.compile(r'<meta itemprop="identifier" content="(UC[0-9A-Za-z_-]{22})">'),
    re.compile(r'channel/(UC[0-9A-Za-z_-]{22})'),
]


def resolve_handle(handle: str, session: requests.Session) -> str | None:
    """Retorna o channel_id (UC...) para um @handle, ou None."""
    handle = handle.strip()
    if not handle.startswith("@"):
        handle = "@" + handle
    url = f"https://www.youtube.com/{handle}"
    try:
        r = session.get(url, headers={"User-Agent": UA}, timeout=15)
        r.raise_for_status()
    except requests.RequestException as e:
        print(f"  ! erro ao buscar {url}: {e}")
        return None
    html = r.text
    for pat in PATTERNS:
        m = pat.search(html)
        if m:
            return m.group(1)
    print(f"  ! channelId não encontrado em {url}")
    return None


def walk(node):
    """Percorre o YAML e devolve todo dict que tenha youtube_handle."""
    if isinstance(node, dict):
        if "youtube_handle" in node:
            yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)


def main(path: str):
    yaml = YAML()
    yaml.preserve_quotes = True
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.load(f)

    session = requests.Session()
    resolved, skipped, failed = 0, 0, 0

    for item in walk(data):
        handle = item.get("youtube_handle")
        if not handle:
            continue
        if item.get("channel_id"):          # já resolvido
            skipped += 1
            continue
        print(f"- {item.get('name', handle)} ({handle}) ...")
        cid = resolve_handle(handle, session)
        if cid:
            item["channel_id"] = cid
            item["rss"] = RSS.format(cid=cid)
            print(f"  -> {cid}")
            resolved += 1
        else:
            failed += 1
        time.sleep(1.0)                      # educado com o YouTube

    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f)

    print(f"\nOK. resolvidos={resolved} já_tinham={skipped} falharam={failed}")
    if failed:
        print("Reveja os handles que falharam (podem ter mudado de nome).")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "config/fontes.yaml")
