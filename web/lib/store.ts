import { listProducts } from "@/lib/catalog";

// Dados da Loja pública. Lê produtos ATIVOS do Supabase (via PostgREST + anon key, sob RLS);
// se o banco não estiver configurado ou vazio, cai no config/catalogo.yaml — a loja nunca
// fica vazia. Quando o agente de produto adicionar itens no banco, aparecem aqui.

export type StoreKind = "curso" | "impressao_3d" | "afiliado" | "proprio";
export interface StoreProduct {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  tipo: StoreKind;
  preco: number | null;
  moeda: string;
  imagem_url: string | null;
  url_base: string | null;
  checkout_url: string | null;
  gratis: boolean;
  cupom: string;
  desconto: string;
  manychat_word: string;
  destaque: boolean;
}

const SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function fromSupabase(): Promise<StoreProduct[] | null> {
  if (!SUPA || !ANON) return null;
  try {
    const url =
      `${SUPA}/rest/v1/products?select=*&status=eq.active&order=destaque.desc,prioridade.asc`;
    const r = await fetch(url, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      // dados de loja mudam pouco; cache curto reduz egress (RLS já filtra ativos)
      next: { revalidate: 120 },
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map((p) => ({
      id: String(p.id),
      slug: String(p.slug || p.id),
      nome: String(p.nome || ""),
      descricao: String(p.descricao || p.gancho || ""),
      tipo: (String(p.tipo) as StoreKind) || "afiliado",
      preco: p.preco == null ? null : Number(p.preco),
      moeda: String(p.moeda || "BRL"),
      imagem_url: (p.imagem_url as string) || null,
      url_base: (p.url_base as string) || null,
      checkout_url: (p.checkout_url as string) || null,
      gratis: Boolean(p.gratis),
      cupom: String(p.cupom || ""),
      desconto: String(p.desconto || ""),
      manychat_word: String(p.manychat_word || ""),
      destaque: Boolean(p.destaque),
    }));
  } catch {
    return null;
  }
}

// fallback determinístico: o catálogo YAML (sempre existe). Infere o tipo dos 3 buckets.
function fromCatalog(): StoreProduct[] {
  return listProducts().map((p) => {
    const tipo: StoreKind =
      p.id === "curso" ? "curso" : p.id === "bjj3d" ? "impressao_3d" : "afiliado";
    return {
      id: p.id,
      slug: p.id,
      nome: p.nome,
      descricao: p.gancho || "",
      tipo,
      preco: null,
      moeda: "BRL",
      imagem_url: null,
      url_base: p.url_base || null,
      checkout_url: null,
      gratis: p.id === "curso",
      cupom: p.cupom || "",
      desconto: p.desconto || "",
      manychat_word: p.manychat || "",
      destaque: false,
    };
  });
}

export async function listStoreProducts(): Promise<{ items: StoreProduct[]; fonte: "supabase" | "catalogo" }> {
  const db = await fromSupabase();
  if (db) return { items: db, fonte: "supabase" };
  return { items: fromCatalog(), fonte: "catalogo" };
}

export const KIND_LABEL: Record<StoreKind, string> = {
  curso: "Cursos digitais",
  impressao_3d: "Impressão 3D",
  afiliado: "Equipamento & instrucionais",
  proprio: "Da casa",
};
