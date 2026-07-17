import { readEnv } from "@/lib/config";
import ConfigEditor from "./ConfigEditor";

export const dynamic = "force-dynamic";

export default function Config() {
  const vars = readEnv();
  return (
    <>
      <div className="a-top">
        <div>
          <h1>Chaves & configuração</h1>
          <p className="sub">Troque as chaves de API e ajustes do .env sem abrir código.</p>
        </div>
      </div>
      <div className="draft-banner">
        <b>Sensível.</b> Este painel edita chaves reais. Nunca exponha o /admin na internet sem autenticação — as chaves ficam gravadas no .env do servidor.
      </div>
      <ConfigEditor vars={vars} />
    </>
  );
}
