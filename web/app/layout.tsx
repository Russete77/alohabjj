import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AlohaBJJ — Notícias e análises do Jiu-Jitsu mundial",
    template: "%s · AlohaBJJ",
  },
  description:
    "Portal de notícias e análises do Jiu-Jitsu mundial com curso completo gratuito de BJJ.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
