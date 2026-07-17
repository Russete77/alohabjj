import fs from "node:fs";
import path from "node:path";

// Base de conhecimento que alimenta os agentes: imagem / áudio / vídeo / texto / link.
// Manifesto em knowledge/sources/index.json; arquivos em knowledge/sources/<id>.<ext>.
// O lado Python (lib/sources.py) lê o mesmo manifesto e injeta no contexto dos agentes.
// Imagens com "atleta" também são copiadas p/ web/public/templates/refs/<slug>.<ext>,
// onde o pipeline de arte já busca referência p/ recontextualização.
const ROOT = path.resolve(process.cwd(), "..");
const DIR = path.join(ROOT, "knowledge", "sources");
const INDEX = path.join(DIR, "index.json");
const REFS = path.join(ROOT, "web", "public", "templates", "refs");

export type SrcType = "image" | "audio" | "video" | "text" | "link";
export interface Source {
  id: string;
  type: SrcType;
  title: string;
  notes: string;
  tags: string[];
  agents: string[]; // "all" | "art_director" | "carousel" | "voz" | "research" | "sales_supervisor"
  filename?: string; // nome no disco (uploads)
  ext?: string;
  url?: string; // type=link
  atleta?: string; // slug do atleta (imagens de referência p/ recontextualização)
  size?: number;
  created: number;
}

export const AGENT_OPTIONS: { key: string; label: string }[] = [
  { key: "all", label: "Todos os agentes" },
  { key: "art_director", label: "Arte (referência visual)" },
  { key: "carousel", label: "Texto / Carrossel" },
  { key: "voz", label: "Voz / tom da marca" },
  { key: "sales_supervisor", label: "Supervisor de vendas" },
  { key: "research", label: "Pesquisa / apuração" },
];

export function listSources(): Source[] {
  if (!fs.existsSync(INDEX)) return [];
  try {
    const arr = JSON.parse(fs.readFileSync(INDEX, "utf-8"));
    return Array.isArray(arr) ? (arr as Source[]).sort((a, b) => b.created - a.created) : [];
  } catch {
    return [];
  }
}

function writeIndex(arr: Source[]): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(arr, null, 2), "utf-8");
}

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const EXT_OK: Record<SrcType, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "gif"],
  audio: ["mp3", "wav", "m4a", "ogg"],
  video: ["mp4", "mov", "webm"],
  text: ["txt", "md"],
  link: [],
};

export interface NewSource {
  type: SrcType;
  title: string;
  notes: string;
  tags: string[];
  agents: string[];
  url?: string;
  atleta?: string;
  file?: { name: string; bytes: Buffer };
}

export function addSource(s: NewSource): Source {
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const entry: Source = {
    id, type: s.type, title: s.title.trim() || "(sem título)",
    notes: s.notes.trim(), tags: s.tags.filter(Boolean),
    agents: s.agents.length ? s.agents : ["all"],
    created: Date.now(),
  };

  if (s.type === "link") {
    if (!s.url || !/^https?:\/\//.test(s.url)) throw new Error("link inválido (use http(s)://)");
    entry.url = s.url.trim();
  } else if (s.type === "text" && !s.file) {
    // texto colado direto vira arquivo .md
    fs.mkdirSync(DIR, { recursive: true });
    const fn = `${id}.md`;
    fs.writeFileSync(path.join(DIR, fn), s.notes, "utf-8");
    entry.filename = fn; entry.ext = "md"; entry.size = Buffer.byteLength(s.notes);
  } else {
    if (!s.file) throw new Error("arquivo obrigatório para este tipo");
    const ext = (s.file.name.split(".").pop() || "").toLowerCase();
    if (!EXT_OK[s.type].includes(ext)) {
      throw new Error(`extensão .${ext} não aceita para ${s.type} (use: ${EXT_OK[s.type].join(", ")})`);
    }
    fs.mkdirSync(DIR, { recursive: true });
    const fn = `${id}.${ext}`;
    fs.writeFileSync(path.join(DIR, fn), s.file.bytes);
    entry.filename = fn; entry.ext = ext; entry.size = s.file.bytes.length;

    // imagem de atleta → também vira referência de recontextualização (refs/<slug>.<ext>)
    if (s.type === "image" && s.atleta) {
      const slug = slugify(s.atleta);
      if (slug) {
        fs.mkdirSync(REFS, { recursive: true });
        fs.copyFileSync(path.join(DIR, fn), path.join(REFS, `${slug}.${ext}`));
        entry.atleta = slug;
      }
    }
  }

  const arr = listSources();
  arr.push(entry);
  writeIndex(arr);
  return entry;
}

export function removeSource(id: string): void {
  const arr = listSources();
  const s = arr.find((x) => x.id === id);
  if (!s) return;
  try { if (s.filename) fs.rmSync(path.join(DIR, s.filename), { force: true }); } catch { /* */ }
  // remove também a cópia em refs/ (se era imagem de atleta)
  try {
    if (s.type === "image" && s.atleta && s.ext) {
      fs.rmSync(path.join(REFS, `${s.atleta}.${s.ext}`), { force: true });
    }
  } catch { /* */ }
  writeIndex(arr.filter((x) => x.id !== id));
}

export function sourceFile(id: string): { path: string; ext: string } | null {
  const s = listSources().find((x) => x.id === id);
  if (!s || !s.filename) return null;
  const p = path.join(DIR, s.filename);
  return fs.existsSync(p) ? { path: p, ext: s.ext || "" } : null;
}
