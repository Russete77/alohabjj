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

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <footer className="pfoot">
        O Jiu-Jitsu está evoluindo. E nós documentamos cada capítulo. · AlohaBJJ · @bjjcomlucas
      </footer>
    </>
  );
}
