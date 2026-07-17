import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

// Link de rastreio /r/<slug>: registra o CLIQUE e redireciona pro destino.
// Grava em tracking/events.jsonl (mesmo formato do lib/tracking.py). Sem banco funciona igual.
const ROOT = path.resolve(process.cwd(), "..");
const OUTPUTS = path.join(ROOT, "outputs");
const EVENTS = path.join(ROOT, "tracking", "events.jsonl");
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

function meta(slug: string): { produto_id?: string; link_afiliado?: string } {
  try { return JSON.parse(fs.readFileSync(path.join(OUTPUTS, slug, "meta.json"), "utf-8")); }
  catch { return {}; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.redirect(FALLBACK);
  const m = meta(slug);
  // registra o clique (best-effort, nunca quebra o redirect)
  try {
    const row = {
      ts: Date.now() / 1000, event_type: "click", piece: slug, product_id: m.produto_id || "",
      utm_source: req.nextUrl.searchParams.get("utm_source") || "",
      referrer: req.headers.get("referer") || "", ua: (req.headers.get("user-agent") || "").slice(0, 200),
    };
    fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
    fs.appendFileSync(EVENTS, JSON.stringify(row) + "\n");
  } catch { /* ignore */ }
  // destino: link de afiliado (quando existir) senão o portal (onde está o curso grátis)
  const to = m.link_afiliado && /^https?:\/\//.test(m.link_afiliado) ? m.link_afiliado : FALLBACK;
  return NextResponse.redirect(to, 302);
}
