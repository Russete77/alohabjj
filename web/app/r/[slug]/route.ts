import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { registraClique } from "@/lib/tracking";

// Link de rastreio /r/<slug>: registra o CLIQUE e redireciona pro destino.
// O clique vai pra tabela `events` do Supabase (ou pro arquivo, em dev sem
// credencial) — ver web/lib/tracking.ts. A gravação NUNCA segura o redirect.
const ROOT = path.resolve(process.cwd(), "..");
const OUTPUTS = path.join(ROOT, "outputs");
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

function meta(slug: string): { produto_id?: string; link_afiliado?: string } {
  try { return JSON.parse(fs.readFileSync(path.join(OUTPUTS, slug, "meta.json"), "utf-8")); }
  catch { return {}; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.redirect(FALLBACK);
  const m = meta(slug);
  registraClique(req, { piece: slug, produto: m.produto_id, source: "peca" });
  // destino: link de afiliado (quando existir) senão o portal (onde está o curso grátis)
  const to = m.link_afiliado && /^https?:\/\//.test(m.link_afiliado) ? m.link_afiliado : FALLBACK;
  return NextResponse.redirect(to, 302);
}
