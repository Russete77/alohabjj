"""
lib/tracking.py — Tracking de conversão (o loop que faz o Supervisor aprender).

Eventos (click/conversion) chegam de dois lugares: das rotas /r, /k e /p (o
clique) e do CLI/painel (a venda). O link de rastreio registra o clique e
redireciona pro destino.

ONDE MORA O DADO. Até a fase 4 a resposta era "tracking/events.jsonl", um
arquivo no disco — e na Vercel o disco é efêmero, então em produção o clique era
gravado e sumia. A memória do Supervisor lia esse arquivo: aprendia de 4 eventos
de teste local e de mais nada. Agora a fonte é a tabela `events` do Supabase
quando há credencial, e o arquivo quando não há (dev local segue funcionando
igual, sem Supabase).

`conversion_memory()` agrega o histórico e devolve um resumo que o build_carousel
injeta no contexto do Supervisor → ele passa a dar peso ao que converte.

CLI:
  python -m lib.tracking stats
  python -m lib.tracking convert <slug> [valor]   # registra uma venda manualmente
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "tracking" / "events.jsonl"
OUTPUTS = ROOT / "outputs"

# Teto de leitura. A agregação é em Python, então precisa de um limite explícito:
# sem ele, no dia em que a tabela crescer, o Supervisor puxaria a tabela inteira
# a cada run. Os mais recentes primeiro.
TETO_LEITURA = 5000


def record(event_type: str, *, piece: str = "", product_id: str = "",
           value: float | None = None, **extra) -> None:
    """Grava um evento (append-only). event_type: impression | click | conversion."""
    EVENTS.parent.mkdir(parents=True, exist_ok=True)
    row = {"ts": time.time(), "event_type": event_type, "piece": piece,
           "product_id": product_id}
    if value is not None:
        row["value"] = value
    row.update({k: v for k, v in extra.items() if v is not None})
    with EVENTS.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    try:  # dual-write best-effort no Supabase (events) — fila assíncrona do lib/db.py
        from lib import db
        db.insert_event({"event_type": event_type, "product_id": product_id or None,
                         # A peça vai em meta->>'piece', a MESMA chave que as rotas
                         # /r, /k e /p usam (web/lib/tracking.ts). Antes ia em
                         # utm_content, que quer dizer outra coisa (o parâmetro da
                         # URL) — dois vocabulários na mesma coluna. A tabela estava
                         # vazia, então dava pra acertar isso sem migrar nada.
                         "meta": {"piece": piece} if piece else None,
                         "value": value,
                         "tracked_url": extra.get("tracked_url")})
    except Exception:  # noqa: BLE001
        pass


def read_events() -> list[dict]:
    """Eventos do ARQUIVO (dev local sem Supabase)."""
    if not EVENTS.exists():
        return []
    out = []
    for line in EVENTS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def read_events_db() -> list[dict] | None:
    """
    Eventos do BANCO, no mesmo formato do arquivo. None = falha de leitura.

    A leitura é síncrona de propósito: quem chama é o Supervisor montando o
    contexto de um run, não um caminho quente de request. A fila assíncrona do
    lib/db.py existe pra ESCRITA (fire-and-forget não serve pra quem precisa da
    resposta), por isso aqui é um GET direto e com timeout curto.

    None e [] são coisas diferentes e não podem virar a mesma: [] é "não há
    evento", None é "não consegui ler". Confundir os dois faria o Supervisor
    tratar uma queda de rede como "nada converte".
    """
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not (url and key):
        return None
    q = (f"{url}/rest/v1/events?select=event_type,product_id,value,utm_content,meta"
         f"&order=occurred_at.desc&limit={TETO_LEITURA}")
    req = urllib.request.Request(q, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as f:
            linhas = json.loads(f.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — o banco nunca pode derrubar o pipeline
        return None
    out = []
    for l in linhas:
        meta = l.get("meta") or {}
        out.append({
            "event_type": l.get("event_type") or "",
            "product_id": l.get("product_id") or "",
            # utm_content como segunda opção: é onde o record() mandava a peça
            # antes da fase 4. Ler as duas chaves é de graça.
            "piece": (meta.get("piece") if isinstance(meta, dict) else None)
                     or l.get("utm_content") or "",
            "value": l.get("value"),
        })
    return out


def events_para_agregar() -> list[dict]:
    """
    A fonte da verdade do momento: banco quando há credencial, arquivo quando não.

    Sempre UMA fonte só. Somar as duas contaria o mesmo clique duas vezes — o
    record() grava no arquivo E espelha no banco.
    """
    from lib import db
    if db.enabled():
        linhas = read_events_db()
        # Falha de leitura vira lista vazia aqui, e conversion_memory() devolve ""
        # — o Supervisor roda SEM a memória, que é o comportamento de quem ainda
        # não tem dado. Cair pro arquivo seria pior: ele mostraria os 4 eventos de
        # teste local como se fossem o histórico de produção.
        return linhas if linhas is not None else []
    return read_events()


def _formato(slug: str) -> str:
    p = OUTPUTS / slug / "meta.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8")).get("formato", "?")
        except Exception:  # noqa: BLE001
            pass
    return "?"


def aggregate() -> dict:
    """Agrega por produto: cliques, vendas, CVR. Lê do banco (ou do arquivo)."""
    agg: dict[str, dict] = {}
    for e in events_para_agregar():
        pid = e.get("product_id") or "?"
        a = agg.setdefault(pid, {"clicks": 0, "conversions": 0, "value": 0.0})
        if e.get("event_type") == "click":
            a["clicks"] += 1
        elif e.get("event_type") == "conversion":
            a["conversions"] += 1
            a["value"] += float(e.get("value") or 0)
    return agg


def conversion_memory(top: int = 8) -> str:
    """Resumo pro Supervisor. Vazio quando ainda não há dados."""
    agg = aggregate()
    if not agg or all(v["clicks"] == 0 and v["conversions"] == 0 for v in agg.values()):
        return ""
    linhas = []
    for pid, a in sorted(agg.items(), key=lambda x: (-x[1]["conversions"], -x[1]["clicks"])):
        cvr = (a["conversions"] / a["clicks"] * 100) if a["clicks"] else 0.0
        linhas.append(f"- {pid}: {a['clicks']} cliques · {a['conversions']} vendas (CVR {cvr:.0f}%)")
    return ("MEMÓRIA DE CONVERSÃO (histórico real — dê PESO ao que converte, sem trair a relevância):\n"
            + "\n".join(linhas[:top]))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "convert":
        slug = sys.argv[2]
        val = float(sys.argv[3]) if len(sys.argv) > 3 else None
        pid = ""
        mp = OUTPUTS / slug / "meta.json"
        if mp.exists():
            pid = json.loads(mp.read_text(encoding="utf-8")).get("produto_id", "")
        record("conversion", piece=slug, product_id=pid, value=val)
        print(f"[tracking] venda registrada: {slug} · {pid} · valor={val}")
    else:
        from lib import db
        fonte = "banco (Supabase events)" if db.enabled() else "arquivo (tracking/events.jsonl)"
        print(f"[tracking] fonte: {fonte}")  # sem isso ninguém sabe de onde veio o número
        print("[tracking] agregado:")
        print(conversion_memory() or "(sem eventos ainda)")
