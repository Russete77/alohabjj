import fs from "node:fs";
import path from "node:path";

// Ideias de produto próprio (esteiras P3): impressão 3D e cursos.
// Geradas por orchestrator/ideate.py (--kind 3d | cursos) em data/ideas_*.json.

const ROOT = path.resolve(process.cwd(), "..");

export interface Idea3D {
  nome: string;
  o_que_e: string;
  quem_compra: string;
  por_que_vende: string;
  personalizacao: string;
  dificuldade: string;
  tempo_impressao: string;
  preco_sugerido_brl: number;
  gancho_conteudo: string;
  fit: number;
  fontes: string[];
}
export interface IdeaCurso {
  titulo: string;
  promessa: string;
  para_quem: string;
  modulos: string[];
  formato: string;
  preco_sugerido_brl: number;
  gancho_conteudo: string;
  por_que_agora: string;
  fit: number;
  fontes: string[];
}

function read<T>(file: string): { gerado_em?: string; ideias: T[] } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "data", file), "utf-8"));
  } catch {
    return null;
  }
}

export const getIdeas3D = () => read<Idea3D>("ideas_3d.json");
export const getIdeasCursos = () => read<IdeaCurso>("ideas_courses.json");
