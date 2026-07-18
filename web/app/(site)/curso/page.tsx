export const metadata = {
  title: "100KG Domínio Absoluto — Curso grátis · AlohaBJJ",
  description: "Curso 100% gratuito de domínio, pressão e controle da posição 100KG do Jiu-Jitsu. Aulas diárias às 20h.",
};

const MAPA = "https://alohabjjnews.com/mapa-mental-sistema-100kg/";
const AULAS = "https://alohabjjnews.com/100kg-dominio-absoluto/";
const HAYABUSA = "https://lcshop.co/EeJo0L";
const BJJ3D = "https://shopee.com.br/bjj3doficial";

const MODULOS = [
  {
    n: 1, titulo: "Domínio e Controle",
    aulas: [
      "Eliminando espaço no primeiro contato",
      "Princípio da substituição",
      "Concentração de peso e controle do quadril",
      "Ponto onde o adversário para de reagir",
      "Transformação de pressão em controle absoluto",
      "Conexão contínua entre posições",
    ],
  },
  {
    n: 2, titulo: "Ataques que Nascem do Domínio",
    aulas: [
      "Estrangulamentos inevitáveis",
      "Armlocks pela reação do adversário",
      "Americanas sem força bruta",
      "Bônus: Mão de vaca invisível",
    ],
  },
];

export default function Curso() {
  return (
    <main className="curso-pg">
      <header className="curso-hero">
        <span className="curso-flag">Curso 100% grátis · aulas diárias às 20h</span>
        <h1>100KG <span>Domínio Absoluto</span></h1>
        <p className="curso-sub">
          O sistema de domínio, pressão e controle da posição 100KG. Aprenda a dominar antes de
          atacar e pressionar antes de finalizar — do jeito que trava o adversário.
        </p>
        <div className="curso-cta">
          <a className="curso-btn primary" href={MAPA} target="_blank" rel="noreferrer">📄 Baixar o Mapa Mental (grátis)</a>
          <a className="curso-btn ghost" href={AULAS} target="_blank" rel="noreferrer">Ver todas as aulas →</a>
        </div>
      </header>

      <section className="curso-mods">
        <h2>O que você vai dominar</h2>
        {MODULOS.map((m) => (
          <div key={m.n} className="curso-mod">
            <div className="curso-mhead">
              <span className="curso-mn">Módulo {m.n}</span>
              <h3>{m.titulo}</h3>
            </div>
            <ol className="curso-aulas">
              {m.aulas.map((a, i) => (
                <li key={i}><span className="curso-an">{String(i + 1 + (m.n === 2 ? 6 : 0)).padStart(2, "0")}</span>{a}</li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <section className="curso-gear">
        <h2>Ferramentas recomendadas</h2>
        <p className="curso-gsub">O que o Lucas usa e recomenda pra treinar o sistema 100KG (parceria · #publi).</p>
        <div className="curso-glist">
          <a className="curso-gcard" href={MAPA} target="_blank" rel="noreferrer">
            <b>🧠 Mapa Mental 100KG</b><span>O sistema inteiro num mapa — baixe e treine com direção.</span>
          </a>
          <a className="curso-gcard" href={HAYABUSA} target="_blank" rel="noreferrer">
            <b>🥋 Hayabusa Fightwear</b><span>Kimono e gear de alto desempenho — cupom LUCAS.</span>
          </a>
          <a className="curso-gcard" href={BJJ3D} target="_blank" rel="noreferrer">
            <b>🛒 Loja BJJ3D</b><span>Produtos 3D exclusivos AlohaBJJ.</span>
          </a>
        </div>
      </section>

      <footer className="curso-final">
        <h2>Comece hoje. É de graça.</h2>
        <a className="curso-btn primary" href={MAPA} target="_blank" rel="noreferrer">Baixar o Mapa Mental →</a>
        <div className="curso-soc">
          <a href="https://www.instagram.com/bjjcomlucas" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://www.tiktok.com/@bjjcomlucas" target="_blank" rel="noreferrer">TikTok</a>
          <a href="https://www.youtube.com/@bjjcomlucas" target="_blank" rel="noreferrer">YouTube</a>
        </div>
      </footer>
    </main>
  );
}
