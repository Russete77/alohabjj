// Acesso PostgREST com a SERVICE KEY. SÓ código de servidor (Server Components,
// Server Actions, Route Handlers). A variável não tem prefixo NEXT_PUBLIC_, então
// o Next não a injeta em bundle de cliente — num componente client ela vem
// undefined e dbEnabled() devolve false.
//
// Contrato importante: dbSelect devolve null em ERRO e [] quando a consulta
// não achou nada. Quem consome NÃO pode tratar os dois igual — null tem que
// levar ao caminho restritivo, senão o porteiro falha aberto na primeira
// instabilidade de rede.

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function dbEnabled(): boolean {
  return Boolean(URL_BASE && KEY);
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** GET no PostgREST. `query` é o trecho depois de /rest/v1/ — ex.: "dossiers?select=*". */
export async function dbSelect<T>(query: string): Promise<T[] | null> {
  if (!dbEnabled()) return null;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T[];
  } catch {
    return null;
  }
}

/** PATCH no PostgREST. Devolve true só quando o banco confirmou. */
export async function dbPatch(query: string, body: Record<string, unknown>): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** POST com merge-duplicates — insere ou atualiza pela chave primária. */
export async function dbUpsert(table: string, body: Record<string, unknown>): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * POST simples (append) — pra tabela append-only como `events`.
 *
 * Duas diferenças deliberadas em relação ao dbUpsert:
 *
 * 1) TIMEOUT CURTO. Quem chama isso é a rota de redirect, no caminho quente do
 *    usuário. Um Supabase lento não pode segurar a função da Vercel até o teto
 *    de execução — 2,5s e desiste. O clique perdido é barato; o redirect preso
 *    é caro.
 *
 * 2) NUNCA LEVANTA. Devolve false em qualquer falha (banco off, rede, HTTP de
 *    erro, timeout). Quem chama trata o clique como best-effort — mas quem
 *    quiser saber se gravou tem a resposta, em vez de um catch mudo.
 */
export async function dbInsert(
  table: string, body: Record<string, unknown> | Record<string, unknown>[],
): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}`, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * DELETE no PostgREST. Devolve true só quando o banco confirmou.
 *
 * CUIDADO: é a única operação destrutiva daqui. Ela morou solta em actions.ts
 * justamente pra não convidar o resto do admin a apagar linha por engano —
 * voltou pro módulo compartilhado quando surgiu o segundo call site legítimo
 * (trocar as tags de um dossiê), porque duas cópias da mesma coisa já mordeu
 * este projeto antes. O aviso continua valendo: pense duas vezes antes do
 * terceiro uso.
 *
 * Trocar conjuntos pequenos apagando e regravando é deliberado: um diff aqui
 * só criaria caminhos para o banco divergir da tela.
 */
export async function dbDelete(query: string): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${query}`, {
      method: "DELETE",
      headers: headers({ Prefer: "return=minimal" }),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}
