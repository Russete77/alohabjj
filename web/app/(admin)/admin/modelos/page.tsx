import { lerConfig } from "@/lib/config-store";
import EditorModelos from "./EditorModelos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelos" };

export interface Etapa {
  etapa: string;
  rotulo: string;
  padrao: string;
  atual: string;
  trocado: boolean;
}

/**
 * O catálogo de etapas vem do BANCO, publicado pelo próprio pipeline.
 *
 * A primeira versão perguntava ao Python por subprocesso — o que funciona na
 * máquina do dono e não funciona na Vercel, onde não existe python nem o
 * repositório. A tela existia e não funcionava justamente onde ele mais ia
 * usá-la.
 *
 * Repetir a lista aqui em TypeScript resolveria o deploy e criaria duas cópias
 * que divergiriam no dia em que um agente novo entrasse — e aí a tela mentiria
 * sobre o que o pipeline faz. Então quem sabe (o Python) publica, e o painel só
 * lê. Ver lib/modelos.publicar_catalogo().
 */
async function catalogo(): Promise<Etapa[] | null> {
  const bruto = await lerConfig("config/modelos-catalogo.json");
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as { etapas?: Etapa[] };
    return Array.isArray(dados.etapas) ? dados.etapas : null;
  } catch {
    return null;
  }
}

export default async function Modelos() {
  const etapas = await catalogo();

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

      {!etapas && (
        <div className="draft-banner">
          <b>O catálogo de etapas ainda não foi publicado.</b> Quem o publica é o
          pipeline — rode <code>python -m orchestrator.seed_config --all</code> uma vez,
          ou espere o ciclo diário. As escolhas já salvas continuam valendo enquanto isso.
        </div>
      )}

      <p className="chint">
        Haiku é o mais barato; Sonnet custa cerca de 3x; Opus, 5x. Vale trocar onde a
        etapa <b>decide</b> (cortar pauta, aprovar imagem) e pensar duas vezes onde ela{" "}
        <b>escreve</b>: o Analista em Haiku economiza e entrega dossiê pior.
      </p>

      {etapas && etapas.length > 0 && <EditorModelos etapas={etapas} />}
    </>
  );
}
