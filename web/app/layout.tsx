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

function Header() {
  return (
    <header className="pheader">
      <nav className="pnav">
        <a href="/" className="brand">
          Aloha<span>BJJ</span>
        </a>
        <a href="/#superlutas" className="link cat superlutas">Superlutas</a>
        <a href="/#noticias" className="link cat noticias">Notícias</a>
        <a href="/#analises" className="link cat analises">Análises</a>
        <a href="/#tecnica" className="link cat tecnica">Técnica</a>
        <a href="/" className="curso">Curso grátis</a>
      </nav>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Header />
        {children}
        <footer className="pfoot">
          O Jiu-Jitsu está evoluindo. E nós documentamos cada capítulo. · AlohaBJJ · @bjjcomlucas
        </footer>
      </body>
    </html>
  );
}
