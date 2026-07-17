import { notFound } from "next/navigation";
import { getPiece } from "@/lib/pieces";
import { publicar, refazer } from "../actions";
import PlatformTabs from "./PlatformTabs";

export const dynamic = "force-dynamic";

export default async function Revisar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPiece(slug);
  if (!p) notFound();

  const publicado = p.estado === "publicado";
  const steps = ["gerado", "aprovado", "publicado"];
  const stepIdx = publicado ? 2 : p.estado === "aprovado" ? 1 : 0;

  return (
    <>
      <div className="a-top">
        <div>
          <a href="/admin" className="crumb-link">← Fila</a>
          <h1>{p.titulo}</h1>
          <p className="sub">{p.formato} · dossiê validado · nota {p.nota ?? "—"}/10</p>
        </div>
      </div>

      <div className="pipe">
        {steps.map((s, i) => (
          <span key={s} className="pstep">
            <span className={`n ${i < stepIdx ? "done" : i === stepIdx ? "now" : ""}`}>{i + 1}</span>
            <span className={i <= stepIdx ? "on" : ""}>{s === "publicado" ? "publicado no portal" : s}</span>
            {i < steps.length - 1 && <span className={`lk ${i < stepIdx ? "done" : ""}`} />}
          </span>
        ))}
      </div>

      {!publicado && (
        <div className="draft-banner">
          <b>RASCUNHO</b> — nada foi publicado ainda. Isto é a prévia da arte gerada. Revise e clique em <b>Aprovar e publicar</b> quando estiver pronto.
        </div>
      )}

      <div className="rev">
        <div className="slides">
          {p.storyPng && (
            <figure className="art">
              <figcaption className="art-lab">
                Arte de capa (Story / Reel)
                <a className="art-dl" href={`/api/art/${p.slug}/${p.storyPng}`} download>baixar alta ↓</a>
              </figcaption>
              <img src={`/api/art/${p.slug}/${p.storyPng}`} alt="arte de capa" />
            </figure>
          )}
          {p.slidePngs.length > 0 ? (
            p.slidePngs.map((f, i) => (
              <figure className="art" key={f}>
                <figcaption className="art-lab">
                  Slide {i + 1}/{p.slidePngs.length} · 1080×1350 (feed)
                  <a className="art-dl" href={`/api/art/${p.slug}/${f}`} download>baixar alta ↓</a>
                </figcaption>
                <img src={`/api/art/${p.slug}/${f}`} alt={`slide ${i + 1}`} />
              </figure>
            ))
          ) : (
            p.slides.map((s, i) => (
              <div className={`slide ${s.cta ? "cta" : ""}`} key={i}>
                <div className="s-top"><span>AlohaBJJ</span><span className="bg">@bjjcomlucas</span></div>
                <div className="s-body">
                  <div className="s-kick">{s.kicker}</div>
                  <h3>{s.titulo}</h3>
                  <p>{s.corpo}</p>
                </div>
                <div className="s-strip">{p.slides.map((_, n) => <i key={n} className={n <= i ? "on" : ""} />)}</div>
              </div>
            ))
          )}
        </div>

        <div className="side">
          <div className="card">
            <div className="c-h"><h3>Caption</h3>{p.disclosure ? <span className="req warn">#publi</span> : <span className="req">CONAR ok</span>}</div>
            <pre className="caption">{p.caption}</pre>
          </div>
          <div className="card">
            <div className="c-h"><h3>Publicação</h3></div>
            <div className="fld"><span className="k">Produto</span><span className="v">curso · {p.produto_id}</span></div>
            <div className="fld"><span className="k">CTA</span><span className="v">{p.cta.slice(0, 48)}…</span></div>
            <div className="fld"><span className="k">Estado</span><span className="v">{p.estado}</span></div>
            <div className="fld"><span className="k">IA</span><span className="v flag">is_ai_generated: true</span></div>

            {publicado ? (
              <div className="published">✓ Publicado no portal · <a href={`/artigo/${p.slug}`}>ver no portal →</a></div>
            ) : (
              <div className="btns">
                <form action={refazer.bind(null, p.slug)}><button className="btn ghost">Refazer</button></form>
                <form action={publicar.bind(null, p.slug)}><button className="btn primary">Aprovar e publicar no portal</button></form>
              </div>
            )}
          </div>

          <div className="card">
            <div className="c-h"><h3>Postar no Instagram</h3></div>
            <ol className="howto-list">
              <li>Baixe os slides em alta (botão <b>baixar alta ↓</b> em cada arte).</li>
              <li>Copie a legenda na aba <b>Pronto para postar</b> abaixo.</li>
              <li>Instagram → novo <b>carrossel</b> → selecione os slides na ordem → cole a legenda.</li>
            </ol>
          </div>
        </div>
      </div>

      {p.platforms && (
        <div className="pkg">
          <div className="sec-h"><h2>Pronto para postar</h2><span className="c">copiar e colar por plataforma · sem editar</span></div>
          <PlatformTabs platforms={p.platforms} />
        </div>
      )}
    </>
  );
}
