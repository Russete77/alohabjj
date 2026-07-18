import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { listStoreProducts } from "@/lib/store";

// Compra na Loja: /p/<id> registra o clique (source=loja) e redireciona pro destino do
// produto — checkout (curso pago), url_base (afiliado) ou o portal (fallback).
const ROOT = path.resolve(process.cwd(), "..");
const EVENTS = path.join(ROOT, "tracking", "events.jsonl");
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]+$/i.test(id)) return NextResponse.redirect(FALLBACK, 302);

  const { items } = await listStoreProducts();
  const prod = items.find((p) => p.id === id || p.slug === id);
  const dest = prod?.checkout_url || prod?.url_base || null;
  const to = dest && /^https?:\/\//.test(dest) ? dest : FALLBACK;

  try {
    const row = {
      ts: Date.now() / 1000, event_type: "click", piece: `loja:${id}`,
      product_id: prod?.id || "", source: "loja",
      referrer: req.headers.get("referer") || "",
      ua: (req.headers.get("user-agent") || "").slice(0, 200),
    };
    fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
    fs.appendFileSync(EVENTS, JSON.stringify(row) + "\n");
  } catch { /* ignore */ }

  return NextResponse.redirect(to, 302);
}
