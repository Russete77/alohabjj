import AgentTownView from "./AgentTownView";
import PipelineControl from "./PipelineControl";

export const dynamic = "force-dynamic";

export default function Agentes() {
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Agentes · Academia AlohaBJJ</h1>
          <p className="sub">Dispare o pipeline (inteiro ou em partes) e veja os agentes rodando ao vivo.</p>
        </div>
      </div>

      <PipelineControl />
      <AgentTownView />
      <div className="belt-legend">
        <span><i style={{ background: "#111111" }} /> preta · Opus</span>
        <span><i style={{ background: "#6B3FA0" }} /> roxa · Sonnet</span>
        <span><i style={{ background: "#6E4A34" }} /> marrom · Sonnet/código</span>
        <span><i style={{ background: "#2F6BB0" }} /> azul · Haiku</span>
        <span><i style={{ background: "#E8E2D5", border: "1px solid #999" }} /> branca · Haiku</span>
      </div>
    </>
  );
}
