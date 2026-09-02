import fs from "node:fs";
import path from "node:path";
import { getDossiersSnapshot } from "./cloud";
import { podeIrAoAr } from "./porteiro";
import { dbSelect } from "./server-db";

// web/ fica dentro de bjj-lucas/ ; a base de conhecimento está em ../knowledge
const KNOWLEDGE = path.resolve(process.cwd(), "..", "knowledge");
const BACKFILL = path.join(KNOWLEDGE, "_backfill");

export type Categoria = "superlutas" | "noticias" | "analises" | "tecnica";

export interface Dossier {
  slug: string;
  titulo: string;
  categoria: Categoria;
  categoriaLabel: string;
  atletas: string[];
  evento: string;
  data: string; // AAAA-MM-DD
  resumoParas: string[]; // parágrafos do summary.md (sem o título)
  imagem: string | null;
  fonteUrl: string | null;
  confianca: string;
  tags: string[];
  status?: string;
  arquivado?: boolean;
  destaque?: boolean;
  ordem?: number | null;
}

const LABEL: Record<Categoria, string> = {
  superlutas: "Superlutas",
  noticias: "Notícias",
  analises: "Análises",
  tecnica: "Técnica",
};

/** Mapeia a categoria real do WordPress (do _backfill) para as 4 do portal. */
function mapCategoria(wpCats: string[], atletas: string[]): Categoria {
  const c = wpCats.map((x) => x.toLowerCase());
  if (c.some((x) => x.includes("superluta"))) return "superlutas";
  if (c.some((x) => x.includes("news") || x.includes("not"))) return "noticias";
  if (c.some((x) => x.includes("anál") || x.includes("anal"))) return "analises";
  // sem categoria útil: se não há atletas, é conteúdo técnico/educacional
  return atletas.length === 0 ? "tecnica" : "superlutas";
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Extrai os parágrafos do summary.md, descartando a primeira linha de título (# ...). */
function parseSummary(md: string): string[] {
  const body = md.replace(/^#[^\n]*\n+/, "");
  return body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// TTL curto: no Fluid Compute a instância vive entre requests, e um cache de
// módulo sem expiração segurava conteúdo novo até a instância reciclar.
let _cache: { at: number; list: Dossier[] } | null = null;
const TTL_MS = 60_000;

function readDossiersFromDisk(): Dossier[] {
  if (!fs.existsSync(KNOWLEDGE)) return [];

  const slugs = fs
    .readdirSync(KNOWLEDGE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_backfill")
    .map((d) => d.name);

  const list: Dossier[] = [];
  for (const slug of slugs) {
    const dir = path.join(KNOWLEDGE, slug);
    const meta = readJson<any>(path.join(dir, "metadata.json"));
    const summaryPath = path.join(dir, "summary.md");
    if (!meta || !fs.existsSync(summaryPath)) continue;

    const back = readJson<any>(path.join(BACKFILL, `${slug}.json`)) ?? {};
    const summary = fs.readFileSync(summaryPath, "utf-8");
    const titulo =
      back.title ?? summary.match(/^#\s*(.+)/)?.[1] ?? slug.replace(/-/g, " ");
    const atletas: string[] = meta.atletas ?? [];
    const categoria = mapCategoria(back.categories ?? [], atletas);

    list.push({
      slug,
      titulo,
      categoria,
      categoriaLabel: LABEL[categoria],
      atletas,
      evento: meta.evento ?? "",
      data: (meta.data ?? back.date ?? "").slice(0, 10),
      resumoParas: parseSummary(summary),
      imagem: meta.imagem ?? back.featured_image ?? null,
      fonteUrl: meta.source_url ?? back.link ?? null,
      confianca: meta.confianca ?? "media",
      tags: meta.tags ?? [],
    });
  }

  list.sort((a, b) => (a.data < b.data ? 1 : -1)); // mais recentes primeiro
  return list;
}

/** Estado editorial vindo do banco, indexado por slug. null = banco não respondeu. */
async function estadoDoBanco(): Promise<Record<string, Partial<Dossier>> | null> {
  const rows = await dbSelect<{
    slug: string; status: string; arquivado: boolean;
    destaque: boolean; ordem: number | null; titulo: string | null; categoria: string | null;
  }>("dossiers?select=slug,status,arquivado,destaque,ordem,titulo,categoria");
  if (rows === null) return null;
  const map: Record<string, Partial<Dossier>> = {};
  for (const r of rows) {
    map[r.slug] = {
      status: r.status,
      arquivado: r.arquivado,
      destaque: r.destaque,
      ordem: r.ordem,
      ...(r.titulo ? { titulo: r.titulo } : {}),
      ...(r.categoria ? { categoria: r.categoria as Categoria } : {}),
    };
  }
  return map;
}

/** Todo o conteúdo, publicado ou não. SÓ para o /admin. */
export async function listAll(): Promise<Dossier[]> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.list;
  let list = readDossiersFromDisk();
  if (list.length === 0) {
    const snap = await getDossiersSnapshot();
    if (snap) list = Object.values(snap) as Dossier[];
  }
  const estado = await estadoDoBanco();
  if (estado) list = list.map((d) => ({ ...d, ...(estado[d.slug] ?? {}) }));
  list.sort((a, b) => (a.data < b.data ? 1 : -1));
  _cache = { at: Date.now(), list };
  return list;
}

/**
 * O que o portal pode servir. NUNCA lê o disco cru sem o estado do banco.
 *
 * Falha FECHADO: se o banco não responder, cai no snapshot — que o
 * sync_to_cloud já publicou contendo só material liberado. Nunca no disco
 * inteiro, que tem os não-verificados.
 */
export async function listPublic(): Promise<Dossier[]> {
  const estado = await estadoDoBanco();
  if (estado === null) {
    const snap = await getDossiersSnapshot();
    return snap ? (Object.values(snap) as Dossier[]) : [];
  }
  const list = (await listAll()).filter((d) => podeIrAoAr(d));
  list.sort((a, b) => {
    if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1;
    const ao = a.ordem ?? Number.MAX_SAFE_INTEGER;
    const bo = b.ordem ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.data < b.data ? 1 : -1;
  });
  return list;
}

export async function getDossierPublic(slug: string): Promise<Dossier | undefined> {
  return (await listPublic()).find((d) => d.slug === slug);
}

export async function getDossierAdmin(slug: string): Promise<Dossier | undefined> {
  return (await listAll()).find((d) => d.slug === slug);
}

export async function getRelacionados(slug: string, categoria: Categoria, n = 3): Promise<Dossier[]> {
  return (await listPublic())
    .filter((d) => d.slug !== slug && d.categoria === categoria)
    .slice(0, n);
}
