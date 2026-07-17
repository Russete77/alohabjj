"""
lib/tracking.py — Tracking de conversão (o loop que faz o Supervisor aprender).

Eventos (click/conversion) são gravados em tracking/events.jsonl (funciona SEM banco)
e espelhados no Supabase (events) quando houver credencial. O link de rastreio
(/r/<slug>) registra o clique e redireciona pro destino; a conversão (venda) é
registrada manual (CLI/painel) ou por webhook do afiliado/ManyChat no futuro.

`conversion_memory()` agrega o histórico e devolve um resumo que o build_carousel
injeta no contexto do Supervisor → ele passa a dar peso ao que converte.

CLI:
  python -m lib.tracking stats
  python -m lib.tracking convert <slug> [valor]   # registra uma venda manualmente
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "tracking" / "events.jsonl"
OUTPUTS = ROOT / "outputs"


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
    try:  # dual-write best-effort no Supabase (events)
        from lib import db
        db.insert_event({"event_type": event_type, "product_id": product_id or None,
                         "utm_content": piece or None, "value": value,
                         "tracked_url": extra.get("tracked_url")})
    except Exception:  # noqa: BLE001
        pass


def read_events() -> list[dict]:
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


def _formato(slug: str) -> str:
    p = OUTPUTS / slug / "meta.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8")).get("formato", "?")
        except Exception:  # noqa: BLE001
            pass
    return "?"


def aggregate() -> dict:
    """Agrega por produto: cliques, vendas, CVR."""
    agg: dict[str, dict] = {}
    for e in read_events():
        pid = e.get("product_id") or "?"
        a = agg.setdefault(pid, {"clicks": 0, "conversions": 0, "value": 0.0})
        if e["event_type"] == "click":
            a["clicks"] += 1
        elif e["event_type"] == "conversion":
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
        print("[tracking] agregado:")
        print(conversion_memory() or "(sem eventos ainda)")
