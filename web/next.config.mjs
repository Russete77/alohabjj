/** @type {import('next').NextConfig} */
const nextConfig = {
  // o portal lê arquivos de ../knowledge no servidor; nada de imagens remotas por ora
  images: { remotePatterns: [{ protocol: "https", hostname: "alohabjjnews.com" }] },
  // uploads da Base de Conhecimento (imagem/áudio/vídeo) passam por Server Action
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};
export default nextConfig;
