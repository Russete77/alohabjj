import fs from "node:fs";
import path from "node:path";

// Candidatos de produto (saída do Product Scout) pro /admin/produtos.
// Lê data/product_candidates.json (escrito pelo lib/candidates.py).
const ROOT = path.resolve(process.cwd(), "..");
const FILE = path.join(ROOT, "data", "product_candidates.json");

export interface Candidate {
  id: string;
  id_sugerido: string;
  nome: string;
  descricao: string;
  gancho: string;
  tags: string[];
  busca: string;
  cta_sugerido: string;
  manychat_word: string;
  categoria: string;
  tipo: string;
  score: number;
  motivo: string;
  disclosure_obrigatorio: boolean;
  fonte: string;
  external_url: string;
  imagem_url: string;
  preco: string;
  precisa_link: boolean;
  ideia_tiktok?: string;
  ideia_instagram?: string;
  vendas?: string;
  status: "proposto" | "aprovado" | "rejeitado";
  created: number;
}

export function listCandidates(): Candidate[] {
  if (!fs.existsSync(FILE)) return [];
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return (Array.isArray(arr) ? arr : []).sort(
      (a: Candidate, b: Candidate) => (b.score || 0) - (a.score || 0),
    );
  } catch {
    return [];
  }
}

export function setStatus(id: string, status: Candidate["status"]): void {
  if (!fs.existsSync(FILE)) return;
  const arr: Candidate[] = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  const found = arr.find((c) => c.id === id || c.id_sugerido === id);
  if (found) {
    found.status = status;
    fs.writeFileSync(FILE, JSON.stringify(arr, null, 2), "utf-8");
  }
}

export function getCandidate(id: string): Candidate | undefined {
  return listCandidates().find((c) => c.id === id || c.id_sugerido === id);
}
