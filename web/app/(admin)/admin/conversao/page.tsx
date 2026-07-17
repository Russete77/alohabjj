import { stats } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export default function Conversao() {
  const { products, pieces, totals } = stats();
  const vazio = totals.clicks === 0 && totals.conversions === 0;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Conversão</h1>
          <p className="sub">O que o sistema aprende — cliques e vendas por produto. O Supervisor prioriza o que mais converte.</p>
        </div>
      </div>

      {vazio ? (
        <div className="empty">
          Sem dados ainda. Os cliques aparecem quando alguém clica no link de rastreio <code>/r/&lt;slug&gt;</code>
          (o que o ManyChat manda na DM). Registre uma venda com <code>python -m lib.tracking convert &lt;slug&gt; &lt;valor&gt;</code>.
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="lab">Cliques</div><div className="num">{totals.clicks}</div></div>
            <div className="kpi"><div className="lab">Vendas</div><div className="num">{totals.conversions}</div></div>
            <div className="kpi"><div className="lab">Receita</div><div className="num">R$ {totals.revenue.toFixed(0)}</div></div>
            <div className="kpi"><div className="lab">CVR médio</div><div className="num">{totals.cvr.toFixed(1)}%</div></div>
          </div>

          <div className="sec-h"><h2>Por produto</h2><span className="c">ranqueado por vendas · o Supervisor dá peso a isso</span></div>
          <table className="conv-tbl">
            <thead><tr><th>Produto</th><th>Cliques</th><th>Vendas</th><th>CVR</th><th>Receita</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.product}>
                  <td className="pn">{p.product}</td>
                  <td>{p.clicks}</td>
                  <td>{p.conversions}</td>
                  <td><span className={`cvr ${p.cvr >= 5 ? "hi" : p.cvr > 0 ? "mid" : "lo"}`}>{p.cvr.toFixed(0)}%</span></td>
                  <td>R$ {p.value.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sec-h"><h2>Peças que mais geraram clique</h2><span className="c">top 12</span></div>
          <table className="conv-tbl">
            <thead><tr><th>Peça</th><th>Produto</th><th>Cliques</th><th>Vendas</th></tr></thead>
            <tbody>
              {pieces.map((p) => (
                <tr key={p.piece}>
                  <td className="pn"><a href={`/admin/${p.piece}`}>{p.titulo}</a></td>
                  <td>{p.produto}</td>
                  <td>{p.clicks}</td>
                  <td>{p.conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
