import type { MetadataRoute } from "next";
import { listPublic } from "@/lib/dossiers";

// Base pública do portal. Mesma convenção das rotas de redirect (/r, /k, /p).
const BASE = (process.env.PORTAL_URL || "https://alohabjjnews.com").replace(/\/+$/, "");

// O portal publica conteúdo novo todo dia; um sitemap congelado no build
// atrasaria a indexação. Uma hora de cache é o suficiente.
export const revalidate = 3600;

/** Converte AAAA-MM-DD em Date. Meio-dia pra não escorregar de fuso. */
function paraData(d: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
  const dt = new Date(`${d}T12:00:00-03:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // listPublic() já filtra pelo porteiro: só entra o que pode ir ao ar.
  const dossiers = await listPublic();
  const maisRecente = dossiers.map((d) => paraData(d.data)).find(Boolean) ?? new Date();

  const fixas: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: maisRecente, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/curso`, lastModified: maisRecente, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/loja`, lastModified: maisRecente, changeFrequency: "weekly", priority: 0.7 },
  ];

  const artigos: MetadataRoute.Sitemap = dossiers.map((d) => ({
    url: `${BASE}/artigo/${d.slug}`,
    lastModified: paraData(d.data),
    changeFrequency: "monthly",
    priority: d.destaque ? 0.9 : 0.8,
  }));

  return [...fixas, ...artigos];
}
