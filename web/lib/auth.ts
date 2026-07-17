// Auth simples do /admin: senha única no .env (ADMIN_PASSWORD) + cookie de sessão
// assinado por HMAC (Web Crypto — funciona no edge/middleware e no server). Sem banco.
// Se ADMIN_PASSWORD não estiver setada, a auth fica DESLIGADA (conveniência de dev).

const COOKIE = "admin_session";
const MSG = "aloha-admin-session-v1";

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

export async function sessionToken(): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(MSG));
  return b64url(new Uint8Array(sig));
}

export function checkPassword(pw: string): boolean {
  const real = process.env.ADMIN_PASSWORD || "";
  return real.length > 0 && pw === real;
}
