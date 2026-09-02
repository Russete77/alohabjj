// Espelho de lib/config_store.py no lado web.
//
// Mesma regra: o BANCO manda, o arquivo do git é semente. A diferença é que
// aqui a ESCRITA é o caso principal — é esta camada que o /admin usa pra salvar
// prompt, catálogo e fontes. Antes ela era fs.writeFileSync num caminho que não
// existe na Vercel: salvava nada e não dizia.
//
// Leitura sem banco cai no arquivo (dev local segue funcionando). ESCRITA sem
// banco NÃO cai no arquivo: gravar em disco na Vercel é o defeito que esta fase
// existe pra corrigir, e fingir sucesso é pior que falhar.

import fs from "node:fs";
import path from "node:path";
import { dbEnabled, dbSelect, dbUpsert } from "./server-db";

const ROOT = path.resolve(process.cwd(), "..");

export interface LinhaConfig {
  path: string;
  conteudo: string;
  updated_at?: string;
  updated_by?: string;
}

function doDisco(p: string): string | null {
  try {
    return fs.readFileSync(path.join(ROOT, p), "utf-8");
  } catch {
    return null;
  }
}

/** Existe disco local? Na Vercel não existe — a tela usa isto pra avisar. */
export function temDisco(): boolean {
  return fs.existsSync(path.join(ROOT, "config"));
}

/** Conteúdo valendo. Banco primeiro; ausente ou fora do ar → arquivo. */
export async function lerConfig(p: string): Promise<string | null> {
  if (dbEnabled()) {
    const linhas = await dbSelect<LinhaConfig>(
      `app_config?path=eq.${encodeURIComponent(p)}&select=conteudo`,
    );
    // null = ERRO de leitura (cai no disco); [] = ainda não semeado (idem).
    if (linhas && linhas.length > 0) return linhas[0].conteudo;
  }
  return doDisco(p);
}

/** Todos os paths que já estão no banco, com quem editou por último. */
export async function listarConfig(): Promise<LinhaConfig[] | null> {
  if (!dbEnabled()) return null;
  return dbSelect<LinhaConfig>(
    "app_config?select=path,updated_at,updated_by&order=path",
  );
}

/**
 * Grava. Devolve erro em texto quando não dá — a tela mostra ao operador.
 *
 * Sem banco NÃO grava em disco de propósito: o silêncio de escrita em disco na
 * Vercel é exatamente o defeito desta fase. Melhor recusar e explicar.
 */
export async function salvarConfig(
  p: string, conteudo: string, quem = "painel",
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!dbEnabled()) {
    return {
      ok: false,
      erro: "Banco não configurado. Sem ele a edição não sobrevive ao deploy — " +
            "confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    };
  }
  const ok = await dbUpsert("app_config", {
    path: p, conteudo, updated_by: quem, updated_at: new Date().toISOString(),
  });
  return ok ? { ok: true } : { ok: false, erro: "o banco recusou a gravação" };
}

// ── Ajustes escalares (o que era .env de negócio) ──────────────────────────

export interface Ajuste { key: string; valor: string | null; segredo: boolean }

/** Chaves de PROVEDOR não moram no banco — ficam no ambiente (Vercel/Actions). */
export const CHAVES_DO_AMBIENTE = [
  "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "RUNWAYML_API_SECRET",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET",
] as const;

/** Configuração de negócio — editável no painel. */
export const AJUSTES_EDITAVEIS = [
  "SPEND_CAP_USD", "DAILY_SPEND_CAP_USD", "SCOUT_MODEL", "IMAGE_PROVIDER_ORDER",
  "AFFILIATE_ORDER", "RADAR_MAX_AGE_DAYS", "WEB_SEARCH_EXTRA_DOMAINS", "PORTAL_URL",
  "AMAZON_PARTNER_TAG", "AMAZON_COUNTRY", "ML_AFFILIATE_TAG", "ML_SITE",
  "SHOPEE_APP_ID", "AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "SHOPEE_APP_SECRET",
] as const;

/** Ajustes que guardam credencial: gravam, nunca devolvem o valor. */
export const AJUSTES_SEGREDO = new Set([
  "AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "SHOPEE_APP_SECRET",
]);

export async function listarAjustes(): Promise<Ajuste[]> {
  const linhas = dbEnabled()
    ? await dbSelect<{ key: string; valor: string | null }>("app_settings?select=key,valor")
    : null;
  const noBanco = new Map((linhas ?? []).map((l) => [l.key, l.valor]));
  return AJUSTES_EDITAVEIS.map((key) => {
    const segredo = AJUSTES_SEGREDO.has(key);
    const bruto = noBanco.get(key) ?? process.env[key] ?? null;
    return {
      key,
      // Segredo nunca volta pra tela: entrar no painel deixa de significar
      // levar a credencial embora. A tela mostra só "configurado".
      valor: segredo ? (bruto ? "•".repeat(8) : null) : bruto,
      segredo,
    };
  });
}

export async function salvarAjuste(
  key: string, valor: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(AJUSTES_EDITAVEIS as readonly string[]).includes(key)) {
    return { ok: false, erro: "esse ajuste não é editável pelo painel" };
  }
  if (!dbEnabled()) return { ok: false, erro: "banco não configurado" };
  const ok = await dbUpsert("app_settings", {
    key, valor, segredo: AJUSTES_SEGREDO.has(key), updated_at: new Date().toISOString(),
  });
  return ok ? { ok: true } : { ok: false, erro: "o banco recusou a gravação" };
}

/** Estado das chaves de provedor: setada ou não. NUNCA o valor. */
export function estadoDasChaves(): { key: string; setada: boolean }[] {
  return CHAVES_DO_AMBIENTE.map((key) => ({ key, setada: Boolean(process.env[key]) }));
}
