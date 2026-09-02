// O .env do projeto mora na RAIZ do repositório (bjj-lucas/.env), junto com o
// pipeline Python — mas o Next só lê .env da própria pasta (web/). Sem isto,
// ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_* ficam
// undefined em desenvolvimento: a auth do /admin fica desligada sem avisar e
// todo acesso ao banco vira no-op.
//
// Na Vercel o arquivo não existe e as variáveis vêm da plataforma — por isso o
// try/catch silencioso. Usa process.loadEnvFile (nativo do Node 20.12+/22),
// sem dependência nova.
import { fileURLToPath } from "node:url";
import path from "node:path";

try {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.loadEnvFile(path.join(raiz, ".env"));
} catch {
  // sem .env na raiz (deploy) — as variáveis vêm do ambiente
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // o portal lê arquivos de ../knowledge no servidor; nada de imagens remotas por ora
  images: { remotePatterns: [{ protocol: "https", hostname: "alohabjjnews.com" }] },
  // uploads da Base de Conhecimento (imagem/áudio/vídeo) passam por Server Action
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};
export default nextConfig;
