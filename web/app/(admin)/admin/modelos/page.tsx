import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import EditorModelos from "./EditorModelos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelos" };

const ROOT = path.resolve(process.cwd(), "..");
const exec = promisify(execFile);

export interface Etapa {
  etapa: string;
  rotulo: string;
  padrao: string;
  atual: string;
  trocado: boolean;
}

/**
 * O catálogo de etapas vive no Python (`lib/modelos.py`), que é quem o pipeline
 * consulta de verdade. A tela pergunta a ele em vez de manter uma segunda
 * lista — duas cópias divergiriam no dia em que alguém acrescentasse um agente,
 * e a tela passaria a mentir sobre o que o pipeline faz.
 */
async function catalogo(): Promise<{ etapas: Etapa[]; erro: string | null }> {
  try {
    const { stdout } = await exec(
      "python",
      [
        "-c",
        "import json,sys;sys.path.insert(0,'.');from lib.modelos import catalogo;print(json.dumps(catalogo()))",
      ],
      { cwd: ROOT, timeout: 15000 },
    );
    return { etapas: JSON.parse(stdout), erro: null };
  } catch (e) {
    // Na Vercel não existe python nem o repositório. A tela diz isso em vez de
    // aparecer vazia e o operador achar que perdeu a configuração.
    return { etapas: [], erro: (e as Error).message };
  }
}

export default async function Modelos() {
  const { etapas, erro } = await catalogo();

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Modelos por etapa</h1>
          <p className="sub">
            Qual modelo roda cada agente. É a alavanca de custo mais direta que você tem.
          </p>
        </div>
      </div>

      {erro && (
        <div className="draft-banner">
          Não consegui ler o catálogo de etapas. Esta tela precisa do Python do
          pipeline, então só funciona onde ele existe — na sua máquina. As escolhas
          já salvas continuam valendo no ciclo diário.
        </div>
      )}

      <p className="chint">
        Haiku é o mais barato; Sonnet custa cerca de 3x; Opus, 5x. Vale trocar onde a
        etapa <b>decide</b> (cortar pauta, aprovar imagem) e pensar duas vezes onde ela{" "}
        <b>escreve</b>: o Analista em Haiku economiza e entrega dossiê pior.
      </p>

      {etapas.length > 0 && <EditorModelos etapas={etapas} />}
    </>
  );
}
