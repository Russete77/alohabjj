import type { Metadata } from "next";
import "./globals.css";


// Base pública do portal. Sem isto, todo caminho relativo de openGraph/twitter
// (inclusive a imagem de compartilhamento) sai quebrado no HTML gerado.
const BASE = (process.env.PORTAL_URL || "https://alohabjjnews.com").replace(/\/+$/, "");
function baseUrl(): URL {
  try {
    return new URL(BASE);
  } catch {
    // PORTAL_URL mal preenchida (sem protocolo, por exemplo) não pode derrubar o build
    return new URL("https://alohabjjnews.com");
  }
}

const TITULO = "AlohaBJJ — Notícias e análises do Jiu-Jitsu mundial";
const DESCRICAO =
  "Portal de notícias e análises do Jiu-Jitsu mundial com curso completo gratuito de BJJ.";

export const metadata: Metadata = {
  metadataBase: baseUrl(),
  title: {
    default: TITULO,
    template: "%s · AlohaBJJ",
  },
  description: DESCRICAO,
  applicationName: "AlohaBJJ",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "AlohaBJJ",
    locale: "pt_BR",
    url: "/",
    title: TITULO,
    description: DESCRICAO,
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
