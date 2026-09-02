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
