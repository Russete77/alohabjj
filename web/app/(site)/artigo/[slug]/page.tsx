import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listPublic, getDossierPublic, getRelacionados } from "@/lib/dossiers";
import { getPiece } from "@/lib/pieces";

const BASE = (process.env.PORTAL_URL || "https://alohabjjnews.com").replace(/\/+$/, "");
const AUTOR = "Lucas";
const AUTOR_URL = "https://www.instagram.com/bjjcomlucas";

export async function generateStaticParams() {
  return (await listPublic()).map((d) => ({ slug: d.slug }));
}

/** AAAA-MM-DD → ISO com fuso de São Paulo. Vazio/inválido vira undefined. */
function paraIso(data: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return undefined;
  const dt = new Date(`${data}T12:00:00-03:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const d = await getDossierPublic(slug);
  if (!d) return {};

  const descricao = d.resumoParas[0]?.slice(0, 155);
  const url = `${BASE}/artigo/${d.slug}`;
  // Caminho relativo (/hero/...) vira absoluto pelo metadataBase do layout raiz.
  const imagens = d.imagem ? [{ url: d.imagem, alt: d.titulo }] : undefined;

  return {
    title: d.titulo,
    description: descricao,
    alternates: { canonical: url },
    keywords: d.tags.length ? d.tags : undefined,
    authors: [{ name: AUTOR, url: AUTOR_URL }],
    openGraph: {
      type: "article",
      url,
      siteName: "AlohaBJJ",
      locale: "pt_BR",
      title: d.titulo,
      description: descricao,
      publishedTime: paraIso(d.data),
      authors: [AUTOR],
      section: d.categoriaLabel,
      tags: d.tags,
      ...(imagens ? { images: imagens } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: d.titulo,
      description: descricao,
      ...(d.imagem ? { images: [d.imagem] } : {}),
    },
  };
}

/** Dado estruturado de notícia — é o que faz o artigo aparecer no Google Notícias. */
function jsonLdArtigo(d: {
  slug: string; titulo: string; data: string; imagem: string | null;
  categoriaLabel: string; tags: string[]; resumoParas: string[];
}) {
  const publicado = paraIso(d.data);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: d.titulo.slice(0, 110),
    description: d.resumoParas[0]?.slice(0, 300),
    ...(d.imagem ? { image: [d.imagem] } : {}),
    ...(publicado ? { datePublished: publicado, dateModified: publicado } : {}),
    author: { "@type": "Person", name: AUTOR, url: AUTOR_URL },
    publisher: { "@type": "Organization", name: "AlohaBJJ", url: BASE },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/artigo/${d.slug}` },
    articleSection: d.categoriaLabel,
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    ...(d.tags.length ? { keywords: d.tags.join(", ") } : {}),
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
  const d = await getDossierPublic(slug);
  if (!d) notFound();

  const relacionados = await getRelacionados(d.slug, d.categoria);
  const peca = await getPiece(d.slug);
  const tempoLeitura = Math.max(
    2,
    Math.round(d.resumoParas.join(" ").split(/\s+/).length / 200),
  );

  const [lead, ...corpo] = d.resumoParas;

  return (
    <main className="pwrap">
      <script
        type="application/ld+json"
        // o "<" vira escape unicode pra um título com HTML nunca fechar o <script>
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdArtigo(d)).replace(/</g, "\\u003c"),
        }}
      />
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
              <span className={`kicker ${d.categoria}`}>{d.categoriaLabel}{d.evento ? ` · ${d.evento}` : ""}</span>
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
        {(() => {
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
