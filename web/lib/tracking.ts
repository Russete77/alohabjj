import fs from "node:fs";
import path from "node:path";

// Lê tracking/events.jsonl (gravado pelo /r/<slug> e pelo lib/tracking.py) e agrega
// pro painel de conversão. Funciona sem banco.
const ROOT = path.resolve(process.cwd(), "..");
const EVENTS = path.join(ROOT, "tracking", "events.jsonl");
const OUTPUTS = path.join(ROOT, "outputs");

export interface Ev { ts: number; event_type: string; piece: string; product_id: string; value?: number }
export interface ProdStat { product: string; clicks: number; conversions: number; value: number; cvr: number }
export interface PieceStat { piece: string; titulo: string; produto: string; clicks: number; conversions: number }

function readEvents(): Ev[] {
  if (!fs.existsSync(EVENTS)) return [];
  const out: Ev[] = [];
  for (const l of fs.readFileSync(EVENTS, "utf-8").split("\n")) {
    const s = l.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* ignore */ }
  }
  return out;
}

function tituloDe(slug: string): { titulo: string; produto: string } {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(OUTPUTS, slug, "meta.json"), "utf-8"));
    return { titulo: m.dossie || slug, produto: m.produto_id || "" };
  } catch { return { titulo: slug, produto: "" }; }
}

export function stats() {
  const evs = readEvents();
  const byProd = new Map<string, { clicks: number; conversions: number; value: number }>();
  const byPiece = new Map<string, { clicks: number; conversions: number }>();
  let clicks = 0, conversions = 0, revenue = 0;
  for (const e of evs) {
    const pk = e.product_id || "—", sk = e.piece || "—";
    const p = byProd.get(pk) ?? { clicks: 0, conversions: 0, value: 0 };
    const s = byPiece.get(sk) ?? { clicks: 0, conversions: 0 };
    if (e.event_type === "click") { p.clicks++; s.clicks++; clicks++; }
    else if (e.event_type === "conversion") {
      p.conversions++; s.conversions++; conversions++;
      p.value += Number(e.value || 0); revenue += Number(e.value || 0);
    }
    byProd.set(pk, p); byPiece.set(sk, s);
  }
  const products: ProdStat[] = [...byProd.entries()]
    .map(([product, v]) => ({ product, ...v, cvr: v.clicks ? (v.conversions / v.clicks) * 100 : 0 }))
    .sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
  const pieces: PieceStat[] = [...byPiece.entries()]
    .map(([piece, v]) => ({ piece, ...tituloDe(piece), ...v }))
    .sort((a, b) => b.clicks - a.clicks).slice(0, 12);
  return { products, pieces, totals: { clicks, conversions, revenue, cvr: clicks ? (conversions / clicks) * 100 : 0 } };
}
