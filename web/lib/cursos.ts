import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

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

// extrai o ID do YouTube de várias formas de URL → embed nocookie (privacidade + nosso design)
export function ytEmbed(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
