"use server";

import fs from "node:fs";
import path from "node:path";
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
import { checkPassword, issueSession, cookieName } from "@/lib/auth";
import { hashIp, limparTentativas, registrarTentativa } from "@/lib/rate-limit";
import { motivoBloqueio } from "@/lib/porteiro";
import { dbEnabled, dbPatch, dbSelect } from "@/lib/server-db";
import { getDossierAdmin, invalidaCache } from "@/lib/dossiers";
import { ehCategoria, normalizaOrdem, normalizaTitulo, slugSeguro } from "@/lib/editorial";

export async function login(formData: FormData) {
  const pw = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  const { headers } = await import("next/headers");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "desconhecido";
  const ipHash = await hashIp(ip);

  const { bloqueado } = await registrarTentativa(ipHash);
  if (bloqueado) redirect("/admin/login?erro=bloqueado");

  if (!checkPassword(pw)) redirect("/admin/login?erro=1");
  await limparTentativas(ipHash);

  const token = await issueSession();
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias — igual ao TTL assinado no token
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

// ── Porteiro de publicação ────────────────────────────────────────────────
// É o ÚNICO caminho para conteúdo ir ao ar. O pipeline nunca publica.

/** Resposta comum das ações editoriais. */
type Resultado = { ok: boolean; erro?: string; precisaConfirmar?: string };

/**
 * Toda ação editorial passa por aqui depois de gravar.
 *
 * `revalidatePath` sozinho não bastava: o cache de módulo de `dossiers.ts`
 * tem TTL de 60s e devolvia a lista velha pra página recém-revalidada — a
 * ação parecia não ter funcionado e o operador clicava de novo.
 */
function revalidaConteudo(slug: string) {
  invalidaCache();
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/conteudo");
  revalidatePath(`/artigo/${slug}`);
}

/**
 * O PATCH do PostgREST responde 204 mesmo quando NENHUMA linha casou.
 *
 * Sem esta conferência, editar um dossiê que o pipeline ainda não inseriu no
 * banco devolvia "ok" e não mudava nada — o pior tipo de falha, a silenciosa.
 */
async function existeNoBanco(slug: string): Promise<boolean> {
  const rows = await dbSelect<{ slug: string }>(
    `dossiers?select=slug&slug=eq.${encodeURIComponent(slug)}`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Grava um patch no dossiê, conferindo antes que a linha existe. */
async function patchDossie(slug: string, patch: Record<string, unknown>): Promise<Resultado> {
  if (!slugSeguro(slug)) return { ok: false, erro: "slug inválido" };
  if (!dbEnabled()) return { ok: false, erro: "sem conexão com o banco (SUPABASE_URL/SERVICE_ROLE_KEY)" };
  if (!(await existeNoBanco(slug)))
    return { ok: false, erro: "este dossiê ainda não tem linha no banco — rode o pipeline" };

  const ok = await dbPatch(`dossiers?slug=eq.${encodeURIComponent(slug)}`, patch);
  if (!ok) return { ok: false, erro: "o banco recusou a gravação" };

  revalidaConteudo(slug);
  return { ok: true };
}

/**
 * Promove o dossiê a `published`.
 *
 * Quando o dossiê tem confiança baixa ou tag de bloqueio, a primeira chamada
 * devolve o motivo em vez de publicar. Só a segunda, com confirmado=true,
 * grava. A tela mostra o motivo real ao operador antes disso.
 */
export async function publicarDossie(slug: string, confirmado = false): Promise<Resultado> {
  const d = await getDossierAdmin(slug);
  if (!d) return { ok: false, erro: "dossiê não encontrado" };

  const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });
  if (motivo && !confirmado) return { ok: false, precisaConfirmar: motivo };

  // publicar tira do arquivo morto: as duas coisas juntas seriam contraditórias
  return patchDossie(slug, { status: "published", arquivado: false });
}

export async function despublicarDossie(slug: string): Promise<Resultado> {
  return patchDossie(slug, { status: "validated" });
}

// ── Controle editorial (fase 5) ───────────────────────────────────────────

/**
 * Arquiva ou desarquiva. NÃO apaga arquivo nenhum — é a gaveta, não a lixeira.
 *
 * `status` é preservado de propósito: desarquivar devolve o dossiê ao estado
 * exato em que ele estava. Quem tira do ar é o `podeIrAoAr`, que já barra
 * arquivado mesmo publicado.
 */
export async function arquivarDossie(slug: string, arquivar: boolean): Promise<Resultado> {
  // arquivado nunca é destaque — senão o card grande da home aponta pro nada
  return patchDossie(slug, arquivar ? { arquivado: true, destaque: false } : { arquivado: false });
}

/** Marca/desmarca o card grande da home. A tela avisa quando passam de 3. */
export async function destacarDossie(slug: string, destaque: boolean): Promise<Resultado> {
  return patchDossie(slug, { destaque });
}

/** Posição manual na vitrine. Vazio volta pra ordenação por data. */
export async function reordenarDossie(slug: string, ordem: string | number | null): Promise<Resultado> {
  return patchDossie(slug, { ordem: normalizaOrdem(ordem) });
}

/**
 * Correção humana de título e editoria. A partir daqui o banco VENCE o arquivo.
 *
 * Título vazio grava null de propósito: é como o operador desfaz a correção e
 * devolve a manchete original do arquivo.
 */
export async function corrigirDossie(
  slug: string,
  titulo: string,
  categoria: string,
): Promise<Resultado> {
  const t = normalizaTitulo(titulo);
  if (categoria && !ehCategoria(categoria)) return { ok: false, erro: "editoria desconhecida" };
  return patchDossie(slug, { titulo: t || null, categoria: categoria || null });
}

/**
 * Apaga de vez: a linha do banco E os arquivos do disco.
 *
 * Exige que o operador digite o slug — é a única ação irreversível da tela.
 *
 * Na Vercel não existe disco de projeto: `knowledge/` não está lá, e só o
 * registro sai. A tela avisa disso ANTES do clique (ver `temDiscoLocal`), e
 * não depois — o Next re-renderiza a lista assim que a ação revalida, então
 * qualquer recado pendurado na linha apagada morreria junto com ela.
 *
 * O BANCO VEM PRIMEIRO, e se ele falhar não encostamos no disco. Assim o
 * fracasso é sempre "nada foi apagado", que o operador resolve clicando de
 * novo. Na ordem inversa, um erro de banco deixaria a linha no banco e o
 * artefato já destruído — e o dossiê some da lista, então nem dá pra tentar
 * de novo pela tela.
 */
export async function apagarDossie(slug: string, confirmacao: string): Promise<Resultado> {
  if (!slugSeguro(slug)) return { ok: false, erro: "slug inválido" };
  if (String(confirmacao).trim() !== slug)
    return { ok: false, erro: "digite o slug exatamente como está escrito" };

  if (dbEnabled()) {
    const ok = await dbDelete(`dossiers?slug=eq.${encodeURIComponent(slug)}`);
    if (!ok) return { ok: false, erro: "o banco recusou apagar o registro — nada foi removido" };
  }

  apagaArquivosDoDossie(slug);
  revalidaConteudo(slug);
  return { ok: true };
}

/**
 * DELETE no PostgREST.
 *
 * Mora aqui e não em `lib/server-db.ts` porque apagar é a única operação
 * destrutiva do painel e só um call site pode usá-la — deixá-la no módulo
 * compartilhado convidaria o resto do admin a apagar linha por engano.
 */
async function dbDelete(query: string): Promise<boolean> {
  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) return false;
  try {
    const r = await fetch(`${base}/rest/v1/${query}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Remove os artefatos do dossiê do disco local. Devolve quantos saíram.
 *
 * Sem base de conhecimento em disco (deploy na Vercel) não faz nada — o que a
 * tela já avisou ao operador antes de ele confirmar.
 */
function apagaArquivosDoDossie(slug: string): number {
  // process.cwd() é web/ no dev e no build; a base fica um nível acima
  const knowledge = path.resolve(process.cwd(), "..", "knowledge");
  if (!fs.existsSync(knowledge)) return 0;

  const alvos = [
    path.join(knowledge, slug),
    path.join(knowledge, "_backfill", `${slug}.json`),
    // o hero pode ter sido salvo em qualquer um destes formatos
    ...[".jpg", ".jpeg", ".png", ".webp"].map((ext) =>
      path.resolve(process.cwd(), "public", "hero", `${slug}${ext}`),
    ),
  ];

  let apagados = 0;
  for (const alvo of alvos) {
    if (!fs.existsSync(alvo)) continue;
    try {
      fs.rmSync(alvo, { recursive: true, force: true });
      apagados++;
    } catch {
      // arquivo travado por outro processo — o registro já saiu, o dossiê já
      // não aparece em lugar nenhum; sobra lixo em disco, não conteúdo no ar
    }
  }
  return apagados;
}
