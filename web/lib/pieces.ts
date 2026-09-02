import fs from "node:fs";
import path from "node:path";
import { getDossierAdmin, type Categoria } from "./dossiers";
import { getPiecesSnapshot } from "./cloud";

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
  slidePngs: string[];      // arquivos slide-NN.png gerados (arte REAL)
  storyPng: string | null;  // story.png (arte de capa) se existir
  caption: string;
  platforms: PlatformPackages | null;
}

export interface TikTokBeat { tempo: string; fala: string; texto_tela: string }

export interface PlatformPackages {
  // NB: as chaves batem 1:1 com o que orchestrator/build_platforms.py grava em platforms.json.
  instagram?: {
    emocao_dominante?: string;
    legenda_br: string;
    legenda_us?: string;
    palavras_chave_extras?: string[];
    headline_topo?: { emocao: string; texto: string }[];
    headline_capa?: string[];
    is_ai_generated?: boolean;
  };
  tiktok?: {
    emocao_dominante?: string;
    hook_fala: string;
    hook_tela: string;
    roteiro_beats: TikTokBeat[];
    caption: string;
    hashtags: string[];
    audio_sugestao: string;
    cta_comentario: string;
    gancho_loop: string;
    headline_capa?: string;
    is_ai_generated?: boolean;
  };
  facebook?: {
    emocao_dominante?: string;
    primeira_linha: string;
    legenda: string;
    link_contexto?: string;
    cta_comentario: string;
    hashtags: string[];
    is_ai_generated?: boolean;
  };
  youtube?: { titulo: string; descricao: string; tags: string[] };
  arte?: { story_png?: string; headline?: string; fonte?: string; credito?: string };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function readPiecesFromDisk(): Promise<Piece[]> {
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
    const files = fs.readdirSync(path.join(OUTPUTS, slug));
    const slidePngs = files.filter((f) => /^slide-\d+\.png$/.test(f)).sort();
    const storyPng = files.includes("story.png") ? "story.png" : null;
    // lookup só de exibição (título/categoria), não é portão: a página pública
// já barrou o dossiê não publicado antes de chegar aqui.
    const dossier = await getDossierAdmin(slug);
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
      slidePngs,
      storyPng,
      caption,
      platforms,
    });
  }
  return pieces;
}

// Disco primeiro (local). No deploy (sem disco), cai no snapshot do Storage.
export async function getPieces(): Promise<Piece[]> {
  const fromDisk = await readPiecesFromDisk();
  if (fromDisk.length) return fromDisk;
  const snap = await getPiecesSnapshot();
  return (snap as Piece[] | null) ?? [];
}

export async function getPiece(slug: string): Promise<Piece | undefined> {
  return (await getPieces()).find((p) => p.slug === slug);
}

/** Fonte de uma arte: URL absoluta (Storage, no deploy) usada direto; senão via /api/art (disco local). */
export function artHref(slug: string, fileOrUrl: string): string {
  return /^https?:\/\//.test(fileOrUrl) ? fileOrUrl : `/api/art/${slug}/${fileOrUrl}`;
}

/** Publica (ou rejeita) uma peça: grava o estado no meta.json. Usado por Server Action. */
export function setEstado(slug: string, estado: Piece["estado"]): void {
  const file = path.join(OUTPUTS, slug, "meta.json");
  const meta = readJson<any>(file);
  if (!meta) throw new Error(`Peça não encontrada: ${slug}`);
  meta.estado = estado;
  fs.writeFileSync(file, JSON.stringify(meta, null, 2), "utf-8");
}
