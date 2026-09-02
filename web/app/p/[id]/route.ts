import { NextResponse, type NextRequest } from "next/server";
import { listStoreProducts } from "@/lib/store";
import { registraClique } from "@/lib/tracking";

// Compra na Loja: /p/<id> registra o clique (source=loja) e redireciona pro destino do
// produto — checkout (curso pago), url_base (afiliado) ou o portal (fallback).
const FALLBACK = process.env.PORTAL_URL || "https://alohabjjnews.com";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]+$/i.test(id)) return NextResponse.redirect(FALLBACK, 302);

  const { items } = await listStoreProducts();
  const prod = items.find((p) => p.id === id || p.slug === id);
  const dest = prod?.checkout_url || prod?.url_base || null;
  const to = dest && /^https?:\/\//.test(dest) ? dest : FALLBACK;

  registraClique(req, { piece: `loja:${id}`, produto: prod?.id, source: "loja" });

  return NextResponse.redirect(to, 302);
}
