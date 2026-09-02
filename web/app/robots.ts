import type { MetadataRoute } from "next";

const BASE = (process.env.PORTAL_URL || "https://alohabjjnews.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /admin é a redação; /api é interno; /r, /k e /p são redirects de
        // rastreamento (link do ManyChat, afiliado, produto) — indexar isso
        // só suja o índice e vaza destino de parceria.
        disallow: ["/admin", "/api/", "/r/", "/k/", "/p/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
