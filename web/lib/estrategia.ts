import fs from "node:fs";
import path from "node:path";

// Lê o calendário do Estrategista (config/calendario.json) e as tendências do Trend Scout
// (knowledge/trends/latest.json). Ambos gerados pelos orchestrators plan_week / scout_trends.

const ROOT = path.resolve(process.cwd(), "..");

export interface Slot {
  canal: string;
  formato: string;
  pauta_slug: string;
  angulo: string;
  gancho?: string;
  produto: string;
}
export interface Dia { dia: string; foco: string; slots: Slot[] }
export interface Calendario {
  semana_de: string;
  tese_da_semana: string;
  apostas: { viralizacao_tiktok: string };
  dias: Dia[];
}

export interface Tendencia {
  titulo: string;
  tipo: string;
  o_que_e: string;
  por_que_pega: string;
  como_aplicar: string;
  audio_sugerido: string;
  exemplo_hook: string;
  melhor_para: string;
  fit: number;
  fontes: string[];
}
export interface Trends {
  gerado_em: string;
  resumo: string;
  tendencias: Tendencia[];
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function getCalendario(): Calendario | null {
  return readJson<Calendario>(path.join(ROOT, "config", "calendario.json"));
}

export function getTrends(): Trends | null {
  return readJson<Trends>(path.join(ROOT, "knowledge", "trends", "latest.json"));
}
