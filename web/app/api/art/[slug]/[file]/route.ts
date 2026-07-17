import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

// Serve os PNGs/JPEGs gerados em outputs/<slug>/<file> pro /admin exibir a arte REAL.
const OUTPUTS = path.resolve(process.cwd(), "..", "outputs");
const ok = (s: string) => s && !s.includes("..") && !s.includes("/") && !s.includes("\\");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  if (!ok(slug) || !ok(file)) return new Response("bad request", { status: 400 });
  const full = path.join(OUTPUTS, slug, file);
  if (!full.startsWith(OUTPUTS + path.sep) || !fs.existsSync(full)) {
    return new Response("not found", { status: 404 });
  }
  const ext = path.extname(full).toLowerCase();
  const ct = ext === ".png" ? "image/png"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : "application/octet-stream";
  return new Response(new Uint8Array(fs.readFileSync(full)), {
    headers: { "Content-Type": ct, "Cache-Control": "no-store" },
  });
}
