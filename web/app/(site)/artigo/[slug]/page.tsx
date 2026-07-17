import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDossiers, getDossier, getRelacionados } from "@/lib/dossiers";
import { getPiece } from "@/lib/pieces";

export function generateStaticParams() {
  return getDossiers().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const d = getDossier(slug);
  if (!d) return {};
  return {
    title: d.titulo,
    description: d.resumoParas[0]?.slice(0, 155),
  };
}

function fmtData(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return day && m ? `${day} ${meses[+m - 1]} ${y}` : y;
}

export default async function Artigo(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const d = getDossier(slug);
  if (!d) notFound();

  const relacionados = getRelacionados(d.slug, d.categoria);
  const tempoLeitura = Math.max(
    2,
    Math.round(d.resumoParas.join(" ").split(/\s+/).length / 200),
  );

  return (
    <main className="pwrap">
      <article className="article">
        <div className="crumb">
          <a href="/">Início</a>
          <span>/</span>
          <a href={`/#${d.categoria}`} className={`cat ${d.categoria}`}>{d.categoriaLabel}</a>
        </div>
        <span className={`cat ${d.categoria}`}>{d.categoriaLabel}</span>
        <h1>{d.titulo}</h1>
        <div className="ameta">
          <span className="who">@bjjcomlucas</span>
          {d.data && <span>{fmtData(d.data)}</span>}
          <span>{tempoLeitura} min de leitura</span>
          {d.evento && <span>{d.evento}</span>}
        </div>
        <div className="ahero" style={d.imagem ? { backgroundImage: `url("${d.imagem}")` } : undefined} />
        {d.resumoParas.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {(() => {
          const peca = getPiece(d.slug);
          if (!peca || peca.estado !== "publicado") return null;
          return (
            <div className="carousel-note">
              <div className="k">Carrossel publicado</div>
              <b>Esta análise virou um carrossel de {peca.slides.length} slides no @bjjcomlucas.</b>
            </div>
          );
        })()}
        <div className="abox">
          <div className="k">Quer evoluir além das notícias?</div>
          <h4>Curso 100kg – Domínio Absoluto</h4>
          <p>Desenvolva leitura de jogo e um jogo de pressão sufocante. 100% gratuito.</p>
          <a className="cta" href="/">Acessar grátis no link</a>
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
                <div className="thumb"
                     style={r.imagem ? { backgroundImage: `url("${r.imagem}")` } : undefined}>
                  <span className="badge">{r.categoriaLabel}</span>
                </div>
                <h3>{r.titulo}</h3>
                <div className="meta">{r.atletas.join(" · ") || "Educacional"}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
