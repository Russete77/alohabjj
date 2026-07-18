import { getCurso, listCursos } from "@/lib/cursos";
import CursoPlayer from "./CursoPlayer";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const c = getCurso("100kg") || listCursos()[0];
  return {
    title: c ? `${c.titulo} — Curso grátis · AlohaBJJ` : "Curso · AlohaBJJ",
    description: c?.subtitulo || "",
  };
}

export default function Curso() {
  const c = getCurso("100kg") || listCursos()[0];
  if (!c) return <main className="curso-pg"><p style={{ padding: 40 }}>Curso indisponível.</p></main>;

  return (
    <main className="curso-pg">
      <header className="curso-hero">
        {c.badge && <span className="curso-flag">{c.badge}</span>}
        <h1>{c.titulo}</h1>
        <p className="curso-sub">{c.descricao || c.subtitulo}</p>
        <div className="curso-stat">{c.totalAulas} aulas · {c.gratis ? "100% grátis" : ""}</div>
      </header>

      <CursoPlayer modulos={c.modulos} />

      {c.recomendados.length > 0 && (
        <section className="curso-gear">
          <h2>Ferramentas recomendadas</h2>
          <p className="curso-gsub">O que o Lucas usa e recomenda pra treinar (parceria · #publi).</p>
          <div className="curso-glist">
            {c.recomendados.map((r) => (
              <a key={r.url} className="curso-gcard" href={r.url} target="_blank" rel="noreferrer">
                <b>{r.nome}</b><span>{r.desc}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="curso-final">
        <div className="curso-soc">
          <a href="https://www.instagram.com/bjjcomlucas" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://www.tiktok.com/@bjjcomlucas" target="_blank" rel="noreferrer">TikTok</a>
          <a href="https://www.youtube.com/@bjjcomlucas" target="_blank" rel="noreferrer">YouTube</a>
        </div>
      </footer>
    </main>
  );
}
