import fs from "node:fs";
import path from "node:path";
import { getDossiersSnapshot } from "./cloud";
import { normalizaData, podeIrAoAr } from "./porteiro";
import { dbSelect } from "./server-db";
import {
  aplicaEstado,
  ehCategoria,
  ordenaAdmin,
  ordenaVitrine,
  rotuloCategoria,
  type Categoria,
  type EstadoEditorial,
} from "./editorial";

// web/ fica dentro de bjj-lucas/ ; a base de conhecimento está em ../knowledge
const KNOWLEDGE = path.resolve(process.cwd(), "..", "knowledge");
const BACKFILL = path.join(KNOWLEDGE, "_backfill");

// Re-exportado porque o portal importa `Categoria` daqui desde a fase 0.
// A definição mora em editorial.ts, junto das regras que a usam.
export type { Categoria };

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

/**
 * SUGESTÃO INICIAL de editoria a partir da categoria do WordPress.
 *
 * Não é verdade — é chute. É este `if` que empilhava tudo em "superlutas"
 * sempre que havia atleta e o WordPress não deu categoria útil, e é por isso
 * que a editoria Superlutas ficou inchada e as outras vazias. A partir da
 * fase 5 a coluna `categoria` do banco VENCE isto (ver `aplicaEstado`); este
 * valor só aparece enquanto ninguém corrigiu o dossiê no /admin/conteudo.
 */
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
let _cache: { at: number; list: Dossier[]; bancoOk: boolean } | null = null;
const TTL_MS = 60_000;

/**
 * Derruba o cache. Toda ação do /admin/conteudo chama isto DEPOIS de gravar.
 *
 * Sem isso, `revalidatePath` refaz a página mas `listAll` devolve a lista
 * velha por até 60s — publicar parecia não funcionar e o operador clicava de
 * novo.
 */
export function invalidaCache(): void {
  _cache = null;
}

/**
 * Existe base de conhecimento em disco aqui?
 *
 * Na Vercel não existe: o `knowledge/` não é empacotado no deploy. A tela de
 * conteúdo usa isto pra AVISAR ANTES de apagar que só o registro vai sair —
 * avisar depois do clique irreversível não ajuda ninguém.
 */
export function temDiscoLocal(): boolean {
  return fs.existsSync(KNOWLEDGE);
}

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
      categoriaLabel: rotuloCategoria(categoria),
      atletas,
      evento: meta.evento ?? "",
      data: normalizaData(meta.data ?? back.date),
      resumoParas: parseSummary(summary),
      imagem: meta.imagem ?? back.featured_image ?? null,
      fonteUrl: meta.source_url ?? back.link ?? null,
      confianca: meta.confianca ?? "media",
      tags: meta.tags ?? [],
    });
  }

  return ordenaAdmin(list);
}

/**
 * O snapshot do Storage foi escrito pelo Python, que ainda deriva categoria e
 * rótulo do arquivo. Aqui só garantimos que o objeto é renderizável: categoria
 * conhecida e rótulo coerente com ela. Não inventa estado — o que o snapshot
 * traz já passou pelo filtro de publicação do `sync_to_cloud`.
 */
function saneiaSnapshot(raw: unknown): Dossier[] {
  const itens = Object.values((raw ?? {}) as Record<string, any>);
  return itens.map((d) => {
    const categoria: Categoria = ehCategoria(d?.categoria) ? d.categoria : "noticias";
    return { ...d, categoria, categoriaLabel: rotuloCategoria(categoria) } as Dossier;
  });
}

/** Estado editorial vindo do banco, indexado por slug. null = banco não respondeu. */
async function estadoDoBanco(): Promise<Record<string, EstadoEditorial> | null> {
  const rows = await dbSelect<{
    slug: string; status: string; arquivado: boolean;
    destaque: boolean; ordem: number | null; titulo: string | null; categoria: string | null;
  }>("dossiers?select=slug,status,arquivado,destaque,ordem,titulo,categoria");
  if (rows === null) return null;
  const map: Record<string, EstadoEditorial> = {};
  for (const r of rows) {
    map[r.slug] = {
      status: r.status,
      arquivado: r.arquivado,
      destaque: r.destaque,
      ordem: r.ordem,
      titulo: r.titulo,
      categoria: r.categoria,
    };
  }
  return map;
}

/**
 * Todo o conteúdo, publicado ou não, com um sinal de que o banco respondeu.
 *
 * `bancoOk: false` importa pra tela: sem o estado do banco, tudo aparece como
 * não publicado, e o operador precisa saber que está vendo um retrato falso em
 * vez de achar que alguém despublicou o portal inteiro.
 */
export async function listAllComEstado(): Promise<{ list: Dossier[]; bancoOk: boolean }> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return { list: _cache.list, bancoOk: _cache.bancoOk };

  const estado = await estadoDoBanco();
  let list = readDossiersFromDisk();
  if (list.length === 0) list = saneiaSnapshot(await getDossiersSnapshot());

  if (estado) list = list.map((d) => aplicaEstado(d, estado[d.slug]));
  list = ordenaAdmin(list);

  _cache = { at: Date.now(), list, bancoOk: estado !== null };
  return { list, bancoOk: estado !== null };
}

/** Todo o conteúdo, publicado ou não. SÓ para o /admin. */
export async function listAll(): Promise<Dossier[]> {
  return (await listAllComEstado()).list;
}

/**
 * O que o portal pode servir. NUNCA lê o disco cru sem o estado do banco.
 *
 * Falha FECHADO: se o banco não responder, cai no snapshot — que o
 * sync_to_cloud já publicou contendo só material liberado. Nunca no disco
 * inteiro, que tem os não-verificados.
 */
export async function listPublic(): Promise<Dossier[]> {
  const { list, bancoOk } = await listAllComEstado();
  if (!bancoOk) return ordenaVitrine(saneiaSnapshot(await getDossiersSnapshot()));
  return ordenaVitrine(list.filter((d) => podeIrAoAr(d)));
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
