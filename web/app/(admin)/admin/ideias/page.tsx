import { getIdeas3D, getIdeasCursos } from "@/lib/ideias";
import RunButton from "../calendario/RunButton";


export const dynamic = "force-dynamic";

const brl = (n: number) => (n ? `R$ ${n}` : "grátis");

export default function Ideias() {
  const d3 = getIdeas3D();
  const dc = getIdeasCursos();

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Ideias de produto próprio</h1>
          <p className="sub">Onde a margem é cheia: impressão 3D e cursos. Os agentes propõem; você aprova o que vira produto.</p>
        </div>
        <div className="cal-actions">
          <RunButton task="ideias_3d" label="Gerar ideias 3D" />
          <RunButton task="ideias_cursos" label="Gerar ideias de curso" primary />
        </div>
      </div>

      <div className="sec-h"><h2>Impressão 3D</h2><span className="c">{d3 ? `${d3.ideias.length} · ${d3.gerado_em ?? ""}` : "nenhuma ainda"}</span></div>
      {!d3 ? (
        <div className="empty">Clique em <b>Gerar ideias 3D</b> — o agente busca o que vende e imprime bem.</div>
      ) : (
        <div className="idea-grid">
          {d3.ideias.map((it, i) => (
            <div className="idea-card" key={i}>
              <div className="idea-h"><b>{it.nome}</b><span className="idea-price">{brl(it.preco_sugerido_brl)}</span></div>
              <p className="idea-desc">{it.o_que_e}</p>
              <div className="idea-tags">
                <span className="chip">👤 {it.quem_compra}</span>
                <span className="chip">⚙ {it.dificuldade} · {it.tempo_impressao}</span>
                <span className="chip">✎ {it.personalizacao}</span>
              </div>
              <p className="idea-why"><b>Por que vende:</b> {it.por_que_vende}</p>
              <div className="idea-hook">📱 {it.gancho_conteudo}</div>
              <div className="idea-fit" data-fit={it.fit}>fit {it.fit}/5</div>
            </div>
          ))}
        </div>
      )}

      <div className="sec-h" style={{ marginTop: 30 }}><h2>Cursos</h2><span className="c">{dc ? `${dc.ideias.length} · ${dc.gerado_em ?? ""}` : "nenhuma ainda"}</span></div>
      {!dc ? (
        <div className="empty">Clique em <b>Gerar ideias de curso</b> — a partir do que a audiência pergunta.</div>
      ) : (
        <div className="idea-grid">
          {dc.ideias.map((it, i) => (
            <div className="idea-card" key={i}>
              <div className="idea-h">
                <b>{it.titulo}</b>
                <span className="idea-price">{it.formato === "isca-gratis" ? "isca grátis" : brl(it.preco_sugerido_brl)}</span>
              </div>
              <p className="idea-desc"><b>{it.promessa}</b></p>
              <div className="idea-tags"><span className="chip">👤 {it.para_quem}</span><span className="chip">{it.formato}</span></div>
              <ul className="idea-mods">{it.modulos.map((m, k) => <li key={k}>{m}</li>)}</ul>
              <p className="idea-why"><b>Por que agora:</b> {it.por_que_agora}</p>
              <div className="idea-hook">📱 {it.gancho_conteudo}</div>
              <div className="idea-fit" data-fit={it.fit}>fit {it.fit}/5</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
