/** @type {import('next').NextConfig} */
const nextConfig = {
  // o portal lê arquivos de ../knowledge no servidor; nada de imagens remotas por ora
  images: { remotePatterns: [{ protocol: "https", hostname: "alohabjjnews.com" }] },
};
export default nextConfig;
