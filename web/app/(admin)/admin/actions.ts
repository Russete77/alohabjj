"use server";

import { revalidatePath } from "next/cache";
import { setEstado } from "@/lib/pieces";
import { writeDoc, writeEnvKey } from "@/lib/config";

export async function publicar(slug: string) {
  setEstado(slug, "publicado");
  revalidatePath("/admin");
  revalidatePath(`/admin/${slug}`);
  revalidatePath(`/artigo/${slug}`);
}

export async function refazer(slug: string) {
  setEstado(slug, "gerado");
  revalidatePath("/admin");
  revalidatePath(`/admin/${slug}`);
}

// edição de config pelo painel (sem abrir código) — vale no próximo run do pipeline
export async function salvarPrompt(kind: "agent" | "config", name: string, content: string) {
  writeDoc(kind, name, content);
  revalidatePath("/admin/prompts");
  return { ok: true };
}

export async function salvarChave(key: string, value: string) {
  writeEnvKey(key, value);
  revalidatePath("/admin/config");
  return { ok: true };
}
