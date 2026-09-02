import { NextResponse, type NextRequest } from "next/server";
import { verifySession, authEnabled, cookieName } from "@/lib/auth";

// Protege /admin e /api/art (imagens geradas). Se ADMIN_PASSWORD não estiver setada,
// libera tudo (dev). A tela de login (/admin/login) é sempre pública.
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const cookie = req.cookies.get(cookieName())?.value;
  if (await verifySession(cookie)) return NextResponse.next();

  // API: 401 seco; páginas: redireciona pro login preservando o destino
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Cobre TODAS as rotas /api do painel. `/api/agents/*` ficou de fora até 02/09 e
// respondia sem sessão, entregando slug de dossiê, modelo e custo por chamada —
// confirmado buscando a rota sem cookie. As rotas públicas de redirect (/r, /k,
// /p) continuam fora daqui de propósito: são links que o público segue.
//
// Regra ao criar rota nova em /api: ou ela entra neste matcher, ou o comentário
// no topo dela explica por que é pública.
export const config = {
  matcher: [
    "/admin/:path*",
    "/preview/:path*",   // prévia mostra rascunho: mesma proteção do painel
    "/api/agents/:path*",
    "/api/art/:path*",
    "/api/fonte/:path*",
    "/api/run/:path*",
  ],
};
