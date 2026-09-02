import type { Metadata } from "next";
import { listPublic, type Categoria, type Dossier } from "@/lib/dossiers";

// Quantos cards cada editoria mostra antes do "ver mais". A base cresce todo
// dia; sem isto a home despeja o acervo inteiro numa página só.
const POR_EDITORIA = 12;

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

/**
 * A capa compartilhada é a foto da matéria em destaque — num portal de notícias
 * isso rende muito mais que um cartão fixo da marca, e acompanha a home sozinho.
 */
export async function generateMetadata(): Promise<Metadata> {
  const capa = (await listPublic()).find((d) => d.imagem);
  if (!capa?.imagem) return {};
  const imagens = [{ url: capa.imagem, alt: capa.titulo }];
  // openGraph/twitter não são mesclados campo a campo com o layout raiz:
  // definir aqui substitui o bloco inteiro, então repete-se o essencial.
  return {
    openGraph: {
      type: "website",
      siteName: "AlohaBJJ",
      locale: "pt_BR",
      url: "/",
      images: imagens,
    },
    twitter: { card: "summary_large_image", images: imagens },
  };
}

/** Card de artigo da grade. Mesmo card na primeira leva e no "ver mais". */
function Card({ d }: { d: Dossier }) {
  return (
    <a className={`acard ${d.categoria}`} href={`/artigo/${d.slug}`}>
      <div className="thumb"
           style={d.imagem ? { backgroundImage: `url("${d.imagem}")` } : undefined}>
        <span className="badge">{d.categoriaLabel}</span>
      </div>
      <h3>{d.titulo}</h3>
      <div className="meta">
        {d.data && <span className="cdate">{fmtData(d.data)}</span>}
        <span className="cwho">{d.atletas.slice(0, 3).join(" · ") || d.evento || "Educacional"}</span>
      </div>
    </a>
  );
}

export default async function Home() {
  const dossiers = await listPublic();
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
        // A ordem vem pronta do listPublic() (destaque → ordem → data). Aqui só
        // se filtra por editoria e se corta — nunca se reordena.
        const itens = dossiers.filter((d) => d.categoria === id);
        if (itens.length === 0) return null;
        const primeiros = itens.slice(0, POR_EDITORIA);
        const resto = itens.slice(POR_EDITORIA);
        return (
          <section key={id} id={id}>
            <div className="sec-title">
              <h2>{label}</h2>
              <div className="rule" />
            </div>
            <div className="pgrid">
              {primeiros.map((d) => (
                <Card key={d.slug} d={d} />
              ))}
            </div>
            {resto.length > 0 && (
              // <details> em vez de estado no cliente: abre com Enter/Espaço,
              // funciona sem JS e o resto do acervo continua no HTML pro Google.
              <details className="vermais">
                {/* sem aria-label: o CSS esconde um dos spans, então o nome
                    acessível já vira "Ver menos" quando abre */}
                <summary>
                  <span className="mais">Ver mais {resto.length} em {label}</span>
                  <span className="menos">Ver menos</span>
                </summary>
                <div className="pgrid">
                  {resto.map((d) => (
                    <Card key={d.slug} d={d} />
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}

      <div className="cursoband">
        <div className="t">
          <div className="k">Curso-âncora · 100% gratuito</div>
          <h3>100kg – Domínio Absoluto</h3>
          <p>Jogo de pressão e controle — do conteúdo pro aprofundamento. Acesse pelo menu do site.</p>
        </div>
        <a className="cta" href="/curso">Acessar grátis →</a>
      </div>
    </main>
  );
}
