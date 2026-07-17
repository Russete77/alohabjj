import { listSources, AGENT_OPTIONS } from "@/lib/sources";
import SourcesManager from "./SourcesManager";

export const dynamic = "force-dynamic";

export default function Conhecimento() {
  const sources = listSources();
  const agentLabels = Object.fromEntries(AGENT_OPTIONS.map((a) => [a.key, a.label]));
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Base de conhecimento</h1>
          <p className="sub">As fontes que a IA usa: imagem, voz, vídeo, texto e link. Marque qual agente usa cada uma.</p>
        </div>
      </div>
      <div className="draft-banner">
        <b>Como a IA usa.</b> <b>Imagens com atleta</b> viram referência de recontextualização (a arte nasce da foto real).
        <b> Texto e link</b> entram no contexto do agente marcado (diretrizes, fatos, tom). <b>Voz e vídeo</b> ficam
        guardados como material de referência da marca.
      </div>
      <SourcesManager sources={sources} agentLabels={agentLabels} />
    </>
  );
}
