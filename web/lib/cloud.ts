// Snapshot de conteúdo publicado no Supabase Storage (bucket público `art`).
// O site lê o DISCO primeiro (local); quando o disco não existe (deploy no Vercel),
// cai nestes snapshots. Ver orchestrator/sync_to_cloud.py.

const SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const BUCKET = "art";

function snapUrl(name: string): string {
  return `${SUPA}/storage/v1/object/public/${BUCKET}/data/${name}`;
}

/** URL pública de uma arte no Storage (usada quando o valor não é um caminho local). */
export function artUrl(slug: string, file: string): string {
  return `${SUPA}/storage/v1/object/public/${BUCKET}/${slug}/${file}`;
}

async function fetchSnapshot<T>(name: string): Promise<T | null> {
  if (!SUPA) return null;
  try {
    // conteúdo muda pouco entre publicações; cache reduz egress
    const r = await fetch(snapUrl(name), { next: { revalidate: 300 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const getDossiersSnapshot = () =>
  fetchSnapshot<Record<string, unknown>>("dossiers.json");
export const getPiecesSnapshot = () =>
  fetchSnapshot<unknown[]>("pieces.json");
