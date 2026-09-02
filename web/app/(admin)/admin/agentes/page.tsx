import ConsoleAoVivo from "./ConsoleAoVivo";
import PipelineControl from "./PipelineControl";

export const dynamic = "force-dynamic";

export default function Agentes() {
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Agentes · pipeline</h1>
          <p className="sub">Dispare o pipeline (inteiro ou em partes) e acompanhe cada etapa ao vivo: o que está rodando, com que modelo, quanto custou e o que falhou.</p>
        </div>
      </div>

      <PipelineControl />
      {/* A legenda de faixas de BJJ saiu junto com a visualização pixel-art: ela
          traduzia cor de faixa → nível do modelo. Agora o modelo aparece escrito
          em cada linha do console, sem precisar de legenda pra decodificar. */}
      <ConsoleAoVivo />
    </>
  );
}
