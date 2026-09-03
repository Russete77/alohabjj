import { lerTema } from "@/lib/tema-store";
import { cssDoTema } from "@/lib/tema";


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

function Ticker({ texto }: { texto: string }) {
  return (
    <div className="ticker">
      <div className="wrap">{texto}</div>
    </div>
  );
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const tema = await lerTema();
  return (
    <>
      {/* As variáveis do tema entram DEPOIS do globals.css e por isso vencem.
          Assim trocar a cor da marca no painel muda o portal sem deploy — e
          sem mexer no CSS, que é código. */}
      <style>{`:root {
  ${cssDoTema(tema)}
}`}</style>
      <Header />
      <Ticker texto={tema.textos.ticker} />
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
