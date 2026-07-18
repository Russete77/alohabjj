import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

// Cursos hospedados no nosso site (config/cursos/*.yaml). Self-contained: as aulas tocam
// aqui (embed do YouTube), sem redirecionar pra fora.
const ROOT = path.resolve(process.cwd(), "..");
const DIR = path.join(ROOT, "config", "cursos");

export interface Aula { titulo: string; video: string; descricao: string; }
export interface Modulo { titulo: string; aulas: Aula[]; }
export interface Recomendado { nome: string; url: string; desc: string; }
export interface Curso {
  slug: string; titulo: string; subtitulo: string; descricao: string;
  gratis: boolean; badge: string; capa: string;
  modulos: Modulo[]; recomendados: Recomendado[];
  totalAulas: number;
}

function norm(data: Record<string, unknown>, slug: string): Curso {
  const modulos = (Array.isArray(data.modulos) ? data.modulos : []).map((m: Record<string, unknown>) => ({
    titulo: String(m.titulo || ""),
    aulas: (Array.isArray(m.aulas) ? m.aulas : []).map((a: Record<string, unknown>) => ({
      titulo: String(a.titulo || ""),
      video: String(a.video || ""),
      descricao: String(a.descricao || ""),
    })),
  }));
  return {
    slug: String(data.slug || slug),
    titulo: String(data.titulo || slug),
    subtitulo: String(data.subtitulo || ""),
    descricao: String(data.descricao || ""),
    gratis: Boolean(data.gratis),
    badge: String(data.badge || ""),
    capa: String(data.capa || ""),
    modulos,
    recomendados: (Array.isArray(data.recomendados) ? data.recomendados : []).map((r: Record<string, unknown>) => ({
      nome: String(r.nome || ""), url: String(r.url || ""), desc: String(r.desc || ""),
    })),
    totalAulas: modulos.reduce((n, m) => n + m.aulas.length, 0),
  };
}

export function listCursos(): Curso[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => {
      const data = parse(fs.readFileSync(path.join(DIR, f), "utf-8")) || {};
      return norm(data, f.replace(/\.ya?ml$/, ""));
    });
}

export function getCurso(slug: string): Curso | undefined {
  return listCursos().find((c) => c.slug === slug);
}

// ── escrita (editor do /admin) ──
type CursoInput = Omit<Curso, "totalAulas">;

export function saveCurso(slug: string, c: CursoInput): void {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug inválido");
  const clean = {
    slug,
    titulo: c.titulo || slug,
    subtitulo: c.subtitulo || "",
    descricao: c.descricao || "",
    gratis: c.gratis ?? true,
    badge: c.badge || "",
    capa: c.capa || "",
    modulos: (c.modulos || []).map((m) => ({
      titulo: m.titulo || "",
      aulas: (m.aulas || []).map((a) => ({
        titulo: a.titulo || "", video: a.video || "", descricao: a.descricao || "",
      })),
    })),
    recomendados: (c.recomendados || []).map((r) => ({ nome: r.nome, url: r.url, desc: r.desc })),
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${slug}.yaml`), stringify(clean), "utf-8");
}

export function createCurso(slug: string, titulo: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug inválido (use minúsculas, números e -)");
  if (fs.existsSync(path.join(DIR, `${slug}.yaml`))) throw new Error("já existe um curso com esse slug");
  saveCurso(slug, {
    slug, titulo: titulo || slug, subtitulo: "", descricao: "", gratis: true,
    badge: "Grátis", capa: "",
    modulos: [{ titulo: "Módulo 1", aulas: [{ titulo: "Aula 1", video: "", descricao: "" }] }],
    recomendados: [],
  });
}

// extrai o ID do YouTube de várias formas de URL → embed nocookie (privacidade + nosso design)
export function ytEmbed(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
