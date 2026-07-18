import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

// Cadastro de atletas (config/atletas.yaml) + perfil enriquecido (knowledge/atletas/<slug>.md).
const ROOT = path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, "config", "atletas.yaml");
const PROF = path.join(ROOT, "knowledge", "atletas");

export interface Atleta {
  slug: string; nome: string; x: string; bjjheroes: string;
  equipe: string; peso: string; tags: string[]; notas: string;
  temPerfil: boolean;
}

function readAll(): Record<string, unknown>[] {
  if (!fs.existsSync(FILE)) return [];
  const data = parse(fs.readFileSync(FILE, "utf-8")) || {};
  return Array.isArray(data.atletas) ? data.atletas : [];
}

export function listAtletas(): Atleta[] {
  return readAll().map((a) => ({
    slug: String(a.slug || ""),
    nome: String(a.nome || ""),
    x: String(a.x || ""),
    bjjheroes: String(a.bjjheroes || ""),
    equipe: String(a.equipe || ""),
    peso: String(a.peso || ""),
    tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
    notas: String(a.notas || ""),
    temPerfil: fs.existsSync(path.join(PROF, `${a.slug}.md`)),
  })).sort((x, y) => x.nome.localeCompare(y.nome));
}

function writeAll(rows: Record<string, unknown>[]): void {
  const header = "# config/atletas.yaml — cadastro de atletas (editável no /admin/atletas).\n" +
    "# x = @ do perfil no X. O agente athlete_scout enriquece cada um.\n";
  fs.writeFileSync(FILE, header + stringify({ atletas: rows }), "utf-8");
}

type Patch = Partial<Omit<Atleta, "slug" | "temPerfil">>;

export function saveAtleta(slug: string, patch: Patch): void {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug inválido");
  const rows = readAll();
  const a = rows.find((r) => r.slug === slug);
  if (!a) throw new Error("atleta não encontrado");
  for (const [k, v] of Object.entries(patch)) {
    a[k] = k === "tags" ? (Array.isArray(v) ? v : String(v).split(",").map((t) => t.trim()).filter(Boolean)) : v;
  }
  writeAll(rows);
}

export function addAtleta(slug: string, nome: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug inválido (minúsculas, números e -)");
  const rows = readAll();
  if (rows.some((r) => r.slug === slug)) throw new Error("já existe atleta com esse slug");
  rows.push({ slug, nome: nome || slug, x: "", bjjheroes: "", equipe: "", peso: "", tags: [], notas: "" });
  writeAll(rows);
}

export function getPerfil(slug: string): string | null {
  const f = path.join(PROF, `${slug}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : null;
}
