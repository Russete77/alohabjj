import type { Dossier } from "@/lib/dossiers";
import type { Piece } from "@/lib/pieces";

// O corpo do artigo, extraído para ser UM só.
//
// A prévia do /admin renderiza exatamente este componente com os dados de
// rascunho. Se a prévia usasse outro código, ela mentiria sobre o resultado —
// e prévia que mente é pior que não ter prévia.

function fmtData(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return day && m ? `${day} ${meses[+m - 1]} ${y}` : y;
}

export default function ArtigoView({
  d, peca, relacionados = [],
}: {
  d: Dossier;
  peca?: Piece | null;
  relacionados?: Dossier[];
}) {
  const tempoLeitura = Math.max(
    2,
    Math.round(d.resumoParas.join(" ").split(/\s+/).length / 200),
  );
  const [lead, ...corpo] = d.resumoParas;

  return (
    <>
      <article className="article">
        <div className="crumb">
          <a href="/">Início</a>
          <span>/</span>
          <a href={`/#${d.categoria}`} className={`cat ${d.categoria}`}>{d.categoriaLabel}</a>
        </div>

        {d.imagem ? (
          <div className="ahero-wrap">
            <div className="ahero" style={{ backgroundImage: `url("${d.imagem}")` }} />
            <div className="ahero-grad" />
            <div className="ahero-cap">
              <span className={`kicker ${d.categoria}`}>
                {d.categoriaLabel}{d.evento ? ` · ${d.evento}` : ""}
              </span>
              <h1>{d.titulo}</h1>
            </div>
          </div>
        ) : (
          <>
            <span className={`kicker ${d.categoria}`}>{d.categoriaLabel}</span>
            <h1>{d.titulo}</h1>
          </>
        )}

        <div className="ameta">
          <span className="who">@bjjcomlucas</span>
          {d.data && <span>{fmtData(d.data)}</span>}
          <span>{tempoLeitura} min de leitura</span>
        </div>

        <div className="abody">
          {lead && <p className="lead">{lead}</p>}
          {corpo.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {peca && peca.estado === "publicado" && (
          <div className="carousel-note">
            <div className="k">Carrossel publicado</div>
            <b>Esta análise virou um carrossel de {peca.slides.length} slides no @bjjcomlucas.</b>
          </div>
        )}

        <div className="abox">
          <div className="k">Quer evoluir além das notícias?</div>
          <h4>Curso 100kg – Domínio Absoluto</h4>
          <p>Desenvolva leitura de jogo e um jogo de pressão sufocante. 100% gratuito.</p>
          <a className="cta" href="/curso">Acessar grátis no link</a>
        </div>

        <div className="asign">
          O Jiu-Jitsu está evoluindo. E nós documentamos cada capítulo.
        </div>
      </article>

      {relacionados.length > 0 && (
        <div className="related">
          <div className="sec-title">
            <h2>Relacionados</h2>
            <div className="rule" />
          </div>
          <div className="pgrid">
            {relacionados.map((r) => (
              <a className={`acard ${r.categoria}`} key={r.slug} href={`/artigo/${r.slug}`}>
                <div
                  className="thumb"
                  style={r.imagem ? { backgroundImage: `url("${r.imagem}")` } : undefined}
                >
                  <span className="badge">{r.categoriaLabel}</span>
                </div>
                <h3>{r.titulo}</h3>
                <div className="meta">
                  {r.data && <span className="cdate">{fmtData(r.data)}</span>}
                  <span className="cwho">{r.atletas.slice(0, 3).join(" · ") || r.evento || "Educacional"}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
