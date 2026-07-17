import { NextResponse, type NextRequest } from "next/server";
import { sessionToken, authEnabled, cookieName } from "@/lib/auth";

// Protege /admin e /api/art (imagens geradas). Se ADMIN_PASSWORD não estiver setada,
// libera tudo (dev). A tela de login (/admin/login) é sempre pública.
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const cookie = req.cookies.get(cookieName())?.value;
  const expected = await sessionToken();
  if (cookie && expected && cookie === expected) return NextResponse.next();

  // API: 401 seco; páginas: redireciona pro login preservando o destino
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/api/art/:path*"] };
