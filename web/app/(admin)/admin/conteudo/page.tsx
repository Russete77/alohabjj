import { listAll } from "@/lib/dossiers";
import { motivoBloqueio } from "@/lib/porteiro";
import PublishButton from "./PublishButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conteúdo" };

export default async function Conteudo() {
  const dossiers = await listAll();
  const noAr = dossiers.filter((d) => d.status === "published").length;
  const bloqueados = dossiers.filter((d) => motivoBloqueio({ confianca: d.confianca, tags: d.tags })).length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Conteúdo</h1>
          <p className="sub">Nada vai ao ar sem você publicar aqui</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lab">Na base</div><div className="num">{dossiers.length}</div></div>
        <div className="kpi"><div className="lab">No ar</div><div className="num">{noAr}</div></div>
        <div className="kpi"><div className="lab">Reprovados na apuração</div><div className="num">{bloqueados}</div></div>
      </div>

      <div className="ctable">
        {dossiers.map((d) => {
          const motivo = motivoBloqueio({ confianca: d.confianca, tags: d.tags });
          return (
            <div className={`crow ${motivo ? "risco" : ""}`} key={d.slug}>
              <div className="cinfo">
                <b>{d.titulo}</b>
                <div className="cmeta">
                  <span className={`cat ${d.categoria}`}>{d.categoriaLabel}</span>
                  <span>{d.data}</span>
                  {motivo && <span className="alerta">⚠ {motivo}</span>}
                </div>
              </div>
              <PublishButton
                slug={d.slug}
                publicado={d.status === "published"}
                aviso={motivo ? (d.resumoParas[0] ?? "").slice(0, 180) : null}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
