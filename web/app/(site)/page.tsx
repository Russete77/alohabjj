import { getDossiers, type Categoria } from "@/lib/dossiers";

function fmtData(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return day && m ? `${day} ${meses[+m - 1]} ${y}` : y;
}

const ORDEM: { id: Categoria; label: string }[] = [
  { id: "superlutas", label: "Superlutas" },
  { id: "noticias", label: "Notícias" },
  { id: "analises", label: "Análises" },
  { id: "tecnica", label: "Técnica" },
];

export default function Home() {
  const dossiers = getDossiers();
  const destaque = dossiers[0];
  const laterais = dossiers.slice(1, 5);

  return (
    <main className="pwrap">
      {destaque && (
        <section className="hero">
          <a className="feat" href={`/artigo/${destaque.slug}`}
             style={destaque.imagem ? { backgroundImage: `url("${destaque.imagem}")` } : undefined}>
            <span className={`cat ${destaque.categoria}`}>{destaque.categoriaLabel} · em destaque</span>
            <h2>{destaque.titulo}</h2>
            <p>{destaque.resumoParas[0]?.slice(0, 160)}…</p>
            <div className="meta">
              @bjjcomlucas · {fmtData(destaque.data)}
              {destaque.evento ? ` · ${destaque.evento}` : ""}
            </div>
          </a>
          <div className="side">
            {laterais.map((d) => (
              <a className="hcard" key={d.slug} href={`/artigo/${d.slug}`}>
                <span className={`cat ${d.categoria}`}>{d.categoriaLabel}</span>
                <h3>{d.titulo}</h3>
                <div className="meta">{fmtData(d.data)}{d.evento ? ` · ${d.evento}` : ""}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {ORDEM.map(({ id, label }) => {
        const itens = dossiers.filter((d) => d.categoria === id);
        if (itens.length === 0) return null;
        return (
          <section key={id} id={id}>
            <div className="sec-title">
              <h2>{label}</h2>
              <div className="rule" />
            </div>
            <div className="pgrid">
              {itens.map((d) => (
                <a className={`acard ${d.categoria}`} key={d.slug} href={`/artigo/${d.slug}`}>
                  <div className="thumb"
                       style={d.imagem ? { backgroundImage: `url("${d.imagem}")` } : undefined}>
                    <span className="badge">{d.categoriaLabel}</span>
                  </div>
                  <h3>{d.titulo}</h3>
                  <div className="meta">{d.atletas.join(" · ") || "Educacional"}{d.evento ? ` · ${d.evento}` : ""}</div>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      <div className="cursoband">
        <div className="t">
          <div className="k">Curso-âncora · 100% gratuito</div>
          <h3>100kg – Domínio Absoluto</h3>
          <p>Jogo de pressão e controle — do conteúdo pro aprofundamento. Acesse pelo menu do site.</p>
        </div>
        <a className="cta" href="/">Acessar grátis →</a>
      </div>
    </main>
  );
}
