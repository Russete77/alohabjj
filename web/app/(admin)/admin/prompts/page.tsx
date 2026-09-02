import { listDocs } from "@/lib/config";
import PromptEditor from "./PromptEditor";

export const dynamic = "force-dynamic";

export default async function Prompts() {
  const docs = await listDocs();
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Prompts dos agentes</h1>
          <p className="sub">Edite as instruções (.md) de cada agente e da voz/regras — sem abrir código. Vale no próximo run.</p>
        </div>
      </div>
      <PromptEditor docs={docs} />
    </>
  );
}
