import { getCalendario, getTrends } from "@/lib/estrategia";
import RunButton from "./RunButton";

export const dynamic = "force-dynamic";

const CANAL: Record<string, { label: string; cls: string }> = {
  instagram: { label: "Instagram", cls: "ig" },
  tiktok: { label: "TikTok", cls: "tt" },
  facebook: { label: "Facebook", cls: "fb" },
  youtube: { label: "YouTube", cls: "yt" },
};
const FOCO: Record<string, string> = {
  noticia: "Notícia", curiosidade: "Curiosidade", humor: "Humor",
  tecnica: "Técnica", superluta: "Superluta",
};

export default function Calendario() {
  const cal = getCalendario();
  const trends = getTrends();

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Calendário da semana</h1>
          <p className="sub">O Estrategista decide o quê postar em cada canal; o Trend Scout traz o que está bombando.</p>
        </div>
        <div className="cal-actions">
          <RunButton task="tendencias" label="Buscar tendências" />
          <RunButton task="planejar" label="Planejar a semana" primary />
        </div>
      </div>

      {!cal ? (
        <div className="empty">
          Nenhum plano ainda. Clique em <b>Planejar a semana</b> (roda o Estrategista de Conteúdo).
        </div>
      ) : (
        <>
          <div className="cal-tese">
            <div className="k">Semana de {cal.semana_de}</div>
            <b>{cal.tese_da_semana}</b>
            {cal.apostas?.viralizacao_tiktok && (
              <div className="cal-bet">🚀 Aposta de viralização (TikTok): {cal.apostas.viralizacao_tiktok}</div>
            )}
          </div>

          <div className="cal-grid">
            {cal.dias.map((d) => (
              <div className="cal-day" key={d.dia}>
                <div className="cal-dh">
                  <span className="cal-dia">{d.dia}</span>
                  <span className="cal-foco">{FOCO[d.foco] ?? d.foco}</span>
                </div>
                {d.slots.map((s, i) => {
                  const c = CANAL[s.canal] ?? { label: s.canal, cls: "" };
                  return (
                    <div className="cal-slot" key={i}>
                      <span className={`ptab ${c.cls} on cal-chip`}>{c.label}</span>
                      <div className="cal-slotb">
                        <div><b>{s.formato}</b> · {s.angulo}</div>
                        {s.gancho && <div className="cal-hook">📱 {s.gancho}</div>}
                        {s.produto && <div className="cal-prod"><span className="chip pub">{s.produto}</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec-h" style={{ marginTop: 30 }}>
        <h2>Tendências em alta</h2>
        <span className="c">{trends ? `${trends.tendencias.length} · ${trends.gerado_em}` : "nenhuma ainda"}</span>
      </div>
      {!trends ? (
        <div className="empty">Rode <b>Buscar tendências</b> — o Trend Scout pesquisa o que viraliza no BJJ agora.</div>
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 14 }}>{trends.resumo}</p>
          <div className="trend-grid">
            {trends.tendencias.map((t, i) => (
              <div className="trend-card" key={i}>
                <div className="trend-h">
                  <b>{t.titulo}</b>
                  <span className="trend-fit" data-fit={t.fit}>fit {t.fit}/5</span>
                </div>
                <div className="trend-tipo">{t.tipo} · melhor p/ {t.melhor_para}</div>
                <p className="trend-apply">{t.como_aplicar}</p>
                <div className="trend-meta"><span>🔊 {t.audio_sugerido}</span></div>
                <div className="trend-hook">📱 {t.exemplo_hook}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
