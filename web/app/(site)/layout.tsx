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
        <a href="/loja" className="link">Loja</a>
        <a href="/curso" className="curso">Curso grátis</a>
      </nav>
    </header>
  );
}

function Ticker() {
  return (
    <div className="ticker">
      <div className="wrap">Cobertura ao vivo · Mundial IBJJF · ADCC · resultados, superlutas e análises · @bjjcomlucas</div>
    </div>
  );
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <Ticker />
      {children}
      <footer className="pfoot">
        <div className="in">
          <div className="fbrand">Aloha<span>BJJ</span></div>
          <div className="tag">O Jiu-Jitsu está evoluindo. E nós documentamos cada capítulo.</div>
          <div className="soc">@<span>bjjcomlucas</span></div>
        </div>
      </footer>
    </>
  );
}
