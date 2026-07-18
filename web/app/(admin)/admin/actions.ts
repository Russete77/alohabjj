"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { setEstado } from "@/lib/pieces";
import { writeDoc, writeEnvKey, writeRawConfig } from "@/lib/config";
import { saveProduct, addProduct } from "@/lib/catalog";
import { getCandidate, setStatus } from "@/lib/candidates";
import { saveCurso, createCurso } from "@/lib/cursos";
import { saveAtleta, addAtleta } from "@/lib/atletas";
import { addSource, removeSource, type SrcType } from "@/lib/sources";
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

// catálogo (produtos + links de afiliado + palavra ManyChat)
export async function salvarProduto(
  id: string,
  patch: Record<string, string | boolean | string[]>,
) {
  try {
    saveProduct(id, patch);
    revalidatePath("/admin/catalogo");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function novoProduto(id: string, nome: string, manychat: string) {
  try {
    addProduct(id, nome, manychat);
    revalidatePath("/admin/catalogo");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// base de conhecimento (fontes da IA: imagem/áudio/vídeo/texto/link)
export async function subirFonte(formData: FormData) {
  try {
    const type = String(formData.get("type") || "") as SrcType;
    const file = formData.get("file");
    let filePayload: { name: string; bytes: Buffer } | undefined;
    if (file && file instanceof File && file.size > 0) {
      filePayload = { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) };
    }
    addSource({
      type,
      title: String(formData.get("title") || ""),
      notes: String(formData.get("notes") || ""),
      tags: String(formData.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      agents: formData.getAll("agents").map((a) => String(a)),
      url: String(formData.get("url") || "") || undefined,
      atleta: String(formData.get("atleta") || "") || undefined,
      file: filePayload,
    });
    revalidatePath("/admin/conhecimento");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function excluirFonte(id: string) {
  try {
    removeSource(id);
    revalidatePath("/admin/conhecimento");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// candidatos de produto (Product Scout → gate do Lucas)
export async function aprovarCandidato(id: string) {
  try {
    const c = getCandidate(id);
    if (!c) return { ok: false, erro: "candidato não encontrado" };
    // cria o produto no catálogo (a Loja e o Supervisor já usam) — nasce ATIVO
    addProduct(c.id_sugerido, c.nome, c.manychat_word);
    saveProduct(c.id_sugerido, {
      tipo: c.tipo || "afiliado",
      tags: c.tags || [],
      gatilho: c.motivo || "",
      busca: c.busca || "",
      url_base: c.external_url || "",
      gancho: c.gancho || "",
      cta_sugerido: c.cta_sugerido || "",
      disclosure_obrigatorio: c.disclosure_obrigatorio ?? true,
    });
    setStatus(id, "aprovado");
    revalidatePath("/admin/produtos");
    revalidatePath("/admin/catalogo");
    return { ok: true, precisaLink: !c.external_url };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function rejeitarCandidato(id: string) {
  try {
    setStatus(id, "rejeitado");
    revalidatePath("/admin/produtos");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// editor de curso (/admin/cursos)
export async function salvarCurso(slug: string, curso: unknown) {
  try {
    saveCurso(slug, curso as Parameters<typeof saveCurso>[1]);
    revalidatePath("/admin/cursos");
    revalidatePath("/curso");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function novoCurso(slug: string, titulo: string) {
  try {
    createCurso(slug, titulo);
    revalidatePath("/admin/cursos");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// cadastro de atletas (/admin/atletas)
export async function salvarAtleta(slug: string, patch: Record<string, string | string[]>) {
  try {
    saveAtleta(slug, patch);
    revalidatePath("/admin/atletas");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function novoAtleta(slug: string, nome: string) {
  try {
    addAtleta(slug, nome);
    revalidatePath("/admin/atletas");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// fontes RSS (YAML bruto, validado)
export async function salvarFontes(content: string) {
  try {
    writeRawConfig("fontes.yaml", content);
    revalidatePath("/admin/fontes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
