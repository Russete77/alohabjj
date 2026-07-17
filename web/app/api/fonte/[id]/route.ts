import fs from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { sourceFile } from "@/lib/sources";

// Serve um arquivo da Base de Conhecimento (imagem/áudio/vídeo/texto) pro preview no /admin.
// Protegido pelo middleware (matcher inclui /api/fonte).
const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]+$/i.test(id)) return new NextResponse("bad id", { status: 400 });
  const f = sourceFile(id);
  if (!f) return new NextResponse("not found", { status: 404 });
  const buf = fs.readFileSync(f.path);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": MIME[f.ext] || "application/octet-stream", "Cache-Control": "private, max-age=60" },
  });
}
