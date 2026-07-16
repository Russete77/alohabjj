import fs from "node:fs";
import path from "node:path";

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

let _cache: Dossier[] | null = null;

export function getDossiers(): Dossier[] {
  if (_cache) return _cache;
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
      imagem: back.featured_image ?? null,
      fonteUrl: meta.source_url ?? back.link ?? null,
      confianca: meta.confianca ?? "media",
      tags: meta.tags ?? [],
    });
  }

  list.sort((a, b) => (a.data < b.data ? 1 : -1)); // mais recentes primeiro
  _cache = list;
  return list;
}

export function getDossier(slug: string): Dossier | undefined {
  return getDossiers().find((d) => d.slug === slug);
}

export function getRelacionados(slug: string, categoria: Categoria, n = 3): Dossier[] {
  return getDossiers()
    .filter((d) => d.slug !== slug && d.categoria === categoria)
    .slice(0, n);
}
