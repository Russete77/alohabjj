import { parse, parseDocument, type YAMLSeq, type YAMLMap } from "yaml";
import { lerConfig, salvarConfig } from "./config-store";

// Edição do catálogo de produtos (config/catalogo.yaml) pelo /admin — é onde ficam
// os LINKS DE AFILIADO (url_base), cupons, palavras ManyChat e tags. O Supervisor lê
// esse arquivo a cada run; a rota /k/<PALAVRA> resolve a palavra → produto → link.
// Escrita via parseDocument (CST) → preserva TODOS os comentários do arquivo.
const PATH_CFG = "config/catalogo.yaml";

export interface Product {
  id: string;
  nome: string;
  manychat: string;
  tipo: string;
  prioridade: number | null;
  tags: string[];
  gatilho: string;
  busca: string;
  url_base: string; // "" quando null/ausente — é O LINK DE AFILIADO
  cupom: string;
  desconto: string;
  disclosure_obrigatorio: boolean;
  gancho: string;
  cta_sugerido: string;
}

// campos editáveis pelo painel (o resto do arquivo/comentários fica intacto)
export const EDITABLE = [
  "nome", "manychat", "tipo", "prioridade", "tags", "gatilho",
  "busca", "url_base", "cupom", "desconto", "disclosure_obrigatorio",
  "gancho", "cta_sugerido",
] as const;

function toProduct(p: Record<string, unknown>): Product {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    id: s(p.id),
    nome: s(p.nome),
    manychat: s(p.manychat),
    tipo: s(p.tipo),
    prioridade: p.prioridade == null ? null : Number(p.prioridade),
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t)) : [],
    gatilho: s(p.gatilho),
    busca: s(p.busca),
    url_base: p.url_base == null ? "" : s(p.url_base),
    cupom: s(p.cupom),
    desconto: s(p.desconto),
    disclosure_obrigatorio: Boolean(p.disclosure_obrigatorio),
    gancho: s(p.gancho),
    cta_sugerido: s(p.cta_sugerido),
  };
}

export async function listProducts(): Promise<Product[]> {
  const texto = await lerConfig(PATH_CFG);
  if (!texto) return [];
  const data = parse(texto) || {};
  const produtos = Array.isArray(data.produtos) ? data.produtos : [];
  return produtos.map((p: Record<string, unknown>) => toProduct(p));
}

export async function productByKeyword(kw: string): Promise<Product | null> {
  const up = kw.trim().toUpperCase();
  return (await listProducts()).find((p) => p.manychat.toUpperCase() === up) || null;
}

type Patch = Partial<Record<(typeof EDITABLE)[number], string | boolean | string[]>>;

function coerce(key: string, val: string | boolean | string[]): unknown {
  if (key === "tags") {
    if (Array.isArray(val)) return val;
    return String(val).split(",").map((t) => t.trim()).filter(Boolean);
  }
  if (key === "disclosure_obrigatorio") return val === true || val === "true";
  if (key === "prioridade") {
    const n = Number(val);
    return Number.isFinite(n) && String(val).trim() !== "" ? n : null;
  }
  if (key === "url_base") {
    const s = String(val).trim();
    if (!s) return null; // vazio → null (Supervisor marca precisa_link)
    if (!/^https?:\/\//.test(s)) throw new Error("url_base deve ser http(s):// ou vazio");
    return s;
  }
  return String(val);
}

export async function saveProduct(id: string, patch: Patch): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("id inválido");
  const texto = await lerConfig(PATH_CFG);
  if (!texto) throw new Error("catálogo não encontrado");
  const doc = parseDocument(texto);
  const produtos = doc.get("produtos") as YAMLSeq | undefined;
  if (!produtos || !("items" in produtos)) throw new Error("catalogo sem produtos");
  const item = produtos.items.find(
    (it) => (it as YAMLMap).get?.("id") === id,
  ) as YAMLMap | undefined;
  if (!item) throw new Error("produto não encontrado");
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.includes(k as (typeof EDITABLE)[number])) continue;
    item.set(k, coerce(k, v as string | boolean | string[]));
  }
  const r = await salvarConfig(PATH_CFG, doc.toString());
  if (!r.ok) throw new Error(r.erro);
}

export async function addProduct(id: string, nome: string, manychat: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("id inválido (use minúsculas, números e -)");
  const texto = await lerConfig(PATH_CFG);
  if (!texto) throw new Error("catálogo não encontrado");
  const doc = parseDocument(texto);
  const produtos = doc.get("produtos") as YAMLSeq;
  if (produtos.items.some((it) => (it as YAMLMap).get?.("id") === id)) {
    throw new Error("já existe produto com esse id");
  }
  produtos.add({
    id,
    manychat: manychat.trim().toUpperCase() || id.toUpperCase(),
    nome: nome.trim() || id,
    tipo: "afiliado",
    prioridade: 3,
    tags: [],
    gatilho: "",
    busca: "",
    url_base: null,
    cupom: "",
    disclosure_obrigatorio: true,
    gancho: "",
    cta_sugerido: "",
  });
  const r = await salvarConfig(PATH_CFG, doc.toString());
  if (!r.ok) throw new Error(r.erro);
}
