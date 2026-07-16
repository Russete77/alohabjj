import { getPieces } from "@/lib/pieces";
import { getDossiers } from "@/lib/dossiers";

export const dynamic = "force-dynamic"; // lê outputs/ a cada request (muta ao publicar)

const ESTADO_LABEL: Record<string, string> = {
  gerado: "gerado", aprovado: "aprovado", publicado: "no portal", rejeitado: "rejeitado",
};

export default function AdminHome() {
  const pieces = getPieces();
  const dossiers = getDossiers();
  const noPortal = pieces.filter((p) => p.estado === "publicado").length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Fila de aprovação</h1>
          <p className="sub">Aprove e publique no portal — assets + caption prontos</p>
        </div>
        <div className="run"><span className="pulse" /> Fase B · batch <span className="mono">ended</span></div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lab">Dossiês na base</div><div className="num">{dossiers.length}</div></div>
        <div className="kpi"><div className="lab">Peças geradas</div><div className="num">{pieces.length}</div></div>
        <div className="kpi"><div className="lab">No portal</div><div className="num">{noPortal}</div></div>
        <div className="kpi"><div className="lab">Aguardando</div><div className="num">{pieces.length - noPortal}</div></div>
      </div>

      <div className="sec-h"><h2>Peças</h2><span className="c">{pieces.length} no fluxo</span></div>
      {pieces.length === 0 ? (
        <div className="empty">Nenhuma peça gerada ainda. Rode <code>python -m orchestrator.build_carousel &lt;slug&gt;</code>.</div>
      ) : (
        <div className="q">
          {pieces.map((p) => (
            <a className="qrow" key={p.slug} href={`/admin/${p.slug}`}>
              <div className="fmt">{p.formato}</div>
              <div className="qt">
                <b>{p.titulo}</b>
                <div className="qm">
                  <span className="chip">{p.slides.length} slides</span>
                  <span className="chip">curso · {p.produto_id}</span>
                  {p.hero && <span className="chip img">hero IA</span>}
                  {p.disclosure && <span className="chip pub">#publi</span>}
                  {p.nota != null && <span className="chip">nota {p.nota}/10</span>}
                </div>
              </div>
              <div className={`st ${p.estado}`}><span className="sd" />{ESTADO_LABEL[p.estado] ?? p.estado}</div>
            </a>
          ))}
        </div>
      )}

      <div className="sec-h" id="base" style={{ marginTop: 34 }}><h2>Base de conhecimento</h2><span className="c">{dossiers.length} dossiês · PT-BR</span></div>
      <div className="dgrid">
        {dossiers.slice(0, 12).map((d) => (
          <a className="dc" key={d.slug} href={`/artigo/${d.slug}`}>
            <div className={`ev cat ${d.categoria}`}>{d.categoriaLabel}</div>
            <b>{d.titulo}</b>
            <span className="ath">{d.atletas.join(" · ") || "Educacional"}</span>
          </a>
        ))}
      </div>
    </>
  );
}
