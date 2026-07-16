import fs from "node:fs";
import path from "node:path";
import { getDossier, type Categoria } from "./dossiers";

const OUTPUTS = path.resolve(process.cwd(), "..", "outputs");

export interface Slide {
  kicker: string;
  titulo: string;
  corpo: string;
  cta: boolean;
}

export interface Piece {
  slug: string;
  titulo: string;
  categoria: Categoria;
  categoriaLabel: string;
  formato: string;
  produto_id: string;
  cta: string;
  estado: "gerado" | "aprovado" | "publicado" | "rejeitado";
  nota: number | null;
  disclosure: string | null;
  hero: boolean;
  slides: Slide[];
  caption: string;
  platforms: PlatformPackages | null;
}

export interface PlatformPackages {
  instagram_feed?: { caption: string; primeiro_comentario: string; hashtags: string[]; alt_text: string };
  instagram_reels?: { caption: string; hook: string; hashtags: string[]; audio_sugestao: string };
  tiktok?: { caption: string; hashtags: string[]; roteiro_fala: string; is_ai_generated: boolean };
  youtube_shorts?: { titulo: string; descricao: string; tags: string[] };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function getPieces(): Piece[] {
  if (!fs.existsSync(OUTPUTS)) return [];
  const slugs = fs
    .readdirSync(OUTPUTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const pieces: Piece[] = [];
  for (const slug of slugs) {
    const meta = readJson<any>(path.join(OUTPUTS, slug, "meta.json"));
    if (!meta) continue;
    const slides = readJson<Slide[]>(path.join(OUTPUTS, slug, "slides.json")) ?? [];
    const capPath = path.join(OUTPUTS, slug, "caption.txt");
    const caption = fs.existsSync(capPath) ? fs.readFileSync(capPath, "utf-8") : "";
    const platforms = readJson<PlatformPackages>(path.join(OUTPUTS, slug, "platforms.json"));
    const dossier = getDossier(slug);
    pieces.push({
      slug,
      titulo: dossier?.titulo ?? slug,
      categoria: dossier?.categoria ?? "superlutas",
      categoriaLabel: dossier?.categoriaLabel ?? "Superlutas",
      formato: meta.formato ?? "carrossel",
      produto_id: meta.produto_id ?? "curso",
      cta: meta.cta ?? "",
      estado: meta.estado ?? "gerado",
      nota: meta.quality?.nota ?? null,
      disclosure: meta.disclosure ?? null,
      hero: Boolean(meta.hero),
      slides,
      caption,
      platforms,
    });
  }
  return pieces;
}

export function getPiece(slug: string): Piece | undefined {
  return getPieces().find((p) => p.slug === slug);
}

/** Publica (ou rejeita) uma peça: grava o estado no meta.json. Usado por Server Action. */
export function setEstado(slug: string, estado: Piece["estado"]): void {
  const file = path.join(OUTPUTS, slug, "meta.json");
  const meta = readJson<any>(file);
  if (!meta) throw new Error(`Peça não encontrada: ${slug}`);
  meta.estado = estado;
  fs.writeFileSync(file, JSON.stringify(meta, null, 2), "utf-8");
}
