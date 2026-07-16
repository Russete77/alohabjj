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

      <div className="rev">
        <div className="slides">
          {p.slides.map((s, i) => (
            <div className={`slide ${s.cta ? "cta" : ""}`} key={i}>
              <div className="s-top"><span>AlohaBJJ</span><span className="bg">@bjjcomlucas</span></div>
              <div className="s-body">
                <div className="s-kick">{s.kicker}</div>
                <h3>{s.titulo}</h3>
                <p>{s.corpo}</p>
              </div>
              <div className="s-strip">{p.slides.map((_, n) => <i key={n} className={n <= i ? "on" : ""} />)}</div>
            </div>
          ))}
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
