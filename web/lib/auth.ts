// Auth do /admin: senha única + cookie assinado por HMAC (Web Crypto — funciona
// no middleware edge e no server).
//
// O que mudou nesta versão e por quê:
// 1. O token carrega EXPIRAÇÃO. Antes era HMAC sobre uma string constante, então
//    o mesmo valor valia pra sempre e vazamento de cookie era acesso permanente.
// 2. ADMIN_SESSION_SECRET é obrigatório em produção. Antes, vazio, ele caía pra
//    usar a própria senha como chave de assinatura.
// 3. Comparação de senha em tempo constante.

const COOKIE = "admin_session";
const TTL_PADRAO_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function authEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function cookieName(): string {
  return COOKIE;
}

/** Em produção, subir sem o secret é erro de configuração — não conveniência. */
export function assertConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.ADMIN_PASSWORD) return; // auth desligada de propósito
  if (!process.env.ADMIN_SESSION_SECRET) {
    throw new Error(
      "ADMIN_SESSION_SECRET ausente. Sem ele a senha vira a chave de assinatura. " +
        "Gere com: node -e \"console.log(crypto.randomBytes(48).toString('base64url'))\"",
    );
  }
}

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || "";
  if (s) return s;
  assertConfigured(); // em produção, lança
  return process.env.ADMIN_PASSWORD || ""; // só em dev
}

async function sign(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}

/** Token no formato "<expEmMs>.<assinatura>". A expiração é assinada junto. */
export async function issueSession(ttlMs: number = TTL_PADRAO_MS): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${exp}.${await sign(`v2|${exp}`)}`;
}

export async function verifySession(
  cookie: string | undefined | null,
  agora: number = Date.now(),
): Promise<boolean> {
  if (!cookie) return false;
  const [expRaw, sig] = cookie.split(".");
  if (!expRaw || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= agora) return false;
  return timingSafeEqual(sig, await sign(`v2|${exp}`));
}

/** Comparação de strings sem vazar onde elas divergem. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(pw: string): boolean {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real) return false;
  return timingSafeEqual(pw, real);
}
