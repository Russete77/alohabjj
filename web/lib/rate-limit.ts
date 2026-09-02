// Limite de tentativa no login, no banco. Contador em memória não serve: cada
// instância serverless teria o seu, e quem tenta adivinhar a senha só precisa
// cair em outra instância.
//
// Falha ABERTA de propósito aqui: banco fora do ar não pode trancar o dono
// para fora do próprio painel. O que protege nesse caso é a senha em si —
// por isso a senha precisa ser longa.

import { dbEnabled, dbSelect, dbUpsert } from "./server-db";

const MAX_TENTATIVAS = 8;
const JANELA_MIN = 15;

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registrarTentativa(
  ipHash: string,
): Promise<{ bloqueado: boolean; restantes: number }> {
  if (!dbEnabled()) return { bloqueado: false, restantes: MAX_TENTATIVAS };

  const rows = await dbSelect<{ tentativas: number; janela_ate: string }>(
    `login_attempts?ip_hash=eq.${ipHash}&select=tentativas,janela_ate`,
  );
  if (rows === null) return { bloqueado: false, restantes: MAX_TENTATIVAS }; // falha aberta

  const agora = Date.now();
  const atual = rows[0];
  const expirou = !atual || new Date(atual.janela_ate).getTime() < agora;
  const tentativas = expirou ? 1 : atual.tentativas + 1;
  const janelaAte = expirou
    ? new Date(agora + JANELA_MIN * 60_000).toISOString()
    : atual.janela_ate;

  // Upsert: a linha pode não existir (primeira tentativa deste IP).
  await dbUpsert("login_attempts", { ip_hash: ipHash, tentativas, janela_ate: janelaAte });

  return { bloqueado: tentativas > MAX_TENTATIVAS, restantes: Math.max(0, MAX_TENTATIVAS - tentativas) };
}

export async function limparTentativas(ipHash: string): Promise<void> {
  if (!dbEnabled()) return;
  await dbUpsert("login_attempts", {
    ip_hash: ipHash,
    tentativas: 0,
    janela_ate: new Date(Date.now() + JANELA_MIN * 60_000).toISOString(),
  });
}
