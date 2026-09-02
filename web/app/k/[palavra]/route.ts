import { NextResponse, type NextRequest } from "next/server";
import { productByKeyword } from "@/lib/catalog";
import { registraClique } from "@/lib/tracking";

// Funil ManyChat — link ESTÁVEL por palavra-chave. Você configura o fluxo comment-to-DM
// no ManyChat UMA vez (GI → manda alohabjjnews.com/k/GI) e nunca mais mexe: esta rota
// resolve a palavra → produto no catálogo → link de afiliado atual, e registra o clique.
// Trocar o link do produto no /admin/catalogo já muda o destino de todas as DMs.
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

export async function GET(req: NextRequest, { params }: { params: Promise<{ palavra: string }> }) {
  const { palavra } = await params;
  if (!/^[A-Za-z0-9]{1,20}$/.test(palavra)) return NextResponse.redirect(FALLBACK, 302);

  const prod = productByKeyword(palavra);
  const to = prod?.url_base && /^https?:\/\//.test(prod.url_base) ? prod.url_base : FALLBACK;

  registraClique(req, {
    piece: `k:${palavra.toUpperCase()}`,
    produto: prod?.id,
    source: "manychat",
  });

  return NextResponse.redirect(to, 302);
}
