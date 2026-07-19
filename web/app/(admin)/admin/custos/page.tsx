import { custos } from "@/lib/custos";

export const dynamic = "force-dynamic";

const fmt = (n: number) => `$${n.toFixed(3)}`;

export default function Custos() {
  const c = custos();
  const maxDia = Math.max(0.001, ...c.porDia.map((d) => d.cost));
  const nomeAgente: Record<string, string> = {
    pesquisador: "Pesquisador (web)", athlete_scout: "Atletas (web)", scout: "Produtos (web)",
    analista: "Analista", carrossel: "Carrossel", supervisor: "Supervisor", validador: "Validador",
    avaliador: "Avaliador", radar: "Radar", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
    diretor_arte: "Diretor de Arte", packager: "Empacotador", course_builder: "Criador de curso",
  };

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Custos de IA</h1>
          <p className="sub">Quanto cada agente gasta. O caro é web_search (Pesquisador/scouts) — já otimizado pra effort baixo.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lab">Hoje</div><div className="num">{fmt(c.hoje)}</div></div>
        <div className="kpi"><div className="lab">7 dias</div><div className="num">{fmt(c.semana)}</div></div>
        <div className="kpi"><div className="lab">Total registrado</div><div className="num">{fmt(c.total)}</div></div>
        <div className="kpi"><div className="lab">Teto por run</div><div className="num">${c.caps.run}</div></div>
      </div>

      <div className="sec-h"><h2>Últimos 7 dias</h2></div>
      <div className="cst-days">
        {c.porDia.map((d) => (
          <div key={d.dia} className="cst-day">
            <div className="cst-bar" style={{ height: `${Math.max(4, (d.cost / maxDia) * 90)}px` }} title={fmt(d.cost)} />
            <span className="cst-v">{d.cost > 0 ? fmt(d.cost) : "—"}</span>
            <span className="cst-d">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</span>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Por agente</h2><span className="c">o topo é onde cortar</span></div>
      <table className="conv-tbl">
        <thead><tr><th>Agente</th><th>Chamadas</th><th>$/chamada</th><th>Total</th></tr></thead>
        <tbody>
          {c.porAgente.map((a) => (
            <tr key={a.step}>
              <td className="pn">{nomeAgente[a.step] || a.step}</td>
              <td>{a.n}</td>
              <td>{fmt(a.cost / Math.max(a.n, 1))}</td>
              <td>{fmt(a.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sec-h"><h2>Por modelo</h2></div>
      <table className="conv-tbl">
        <thead><tr><th>Modelo</th><th>%</th><th>Total</th></tr></thead>
        <tbody>
          {c.porModelo.map((m) => (
            <tr key={m.model}><td className="pn">{m.model}</td><td>{m.pct.toFixed(0)}%</td><td>{fmt(m.cost)}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="draft-banner">
        <b>Controlar o teto:</b> edite <b>SPEND_CAP_USD</b> (por run) e <b>DAILY_SPEND_CAP_USD</b> em
        <a href="/admin/config"> Chaves &amp; config</a>. O run PARA sozinho ao bater o teto.
        Scouts rodam em Haiku (barato) + poucas buscas; Pesquisador em Sonnet effort medium.
      </div>
    </>
  );
}
