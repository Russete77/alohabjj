"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { setEstado } from "@/lib/pieces";
import { writeDoc, writeEnvKey } from "@/lib/config";
import { checkPassword, sessionToken, cookieName } from "@/lib/auth";

export async function login(formData: FormData) {
  const pw = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");
  if (!checkPassword(pw)) redirect("/admin/login?erro=1");
  const token = await sessionToken();
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  (await cookies()).delete(cookieName());
  redirect("/admin/login");
}

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
