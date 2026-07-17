import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { productByKeyword } from "@/lib/catalog";

// Funil ManyChat — link ESTÁVEL por palavra-chave. Você configura o fluxo comment-to-DM
// no ManyChat UMA vez (GI → manda alohabjjnews.com/k/GI) e nunca mais mexe: esta rota
// resolve a palavra → produto no catálogo → link de afiliado atual, e registra o clique.
// Trocar o link do produto no /admin/catalogo já muda o destino de todas as DMs.
const ROOT = path.resolve(process.cwd(), "..");
const EVENTS = path.join(ROOT, "tracking", "events.jsonl");
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

export async function GET(req: NextRequest, { params }: { params: Promise<{ palavra: string }> }) {
  const { palavra } = await params;
  if (!/^[A-Za-z0-9]{1,20}$/.test(palavra)) return NextResponse.redirect(FALLBACK, 302);

  const prod = productByKeyword(palavra);
  const to = prod?.url_base && /^https?:\/\//.test(prod.url_base) ? prod.url_base : FALLBACK;

  // registra o clique (best-effort, nunca quebra o redirect)
  try {
    const row = {
      ts: Date.now() / 1000,
      event_type: "click",
      piece: `k:${palavra.toUpperCase()}`,
      product_id: prod?.id || "",
      source: "manychat",
      referrer: req.headers.get("referer") || "",
      ua: (req.headers.get("user-agent") || "").slice(0, 200),
    };
    fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
    fs.appendFileSync(EVENTS, JSON.stringify(row) + "\n");
  } catch { /* ignore */ }

  return NextResponse.redirect(to, 302);
}
