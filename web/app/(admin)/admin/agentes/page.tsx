import { getDossiers } from "@/lib/dossiers";
import { getPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

type Ag = { nome: string; papel: string; modelo: string; cls: string };
const FASE_A: Ag[] = [
  { nome: "Radar", papel: "lê RSS/YouTube · pauta + relevância", modelo: "Haiku", cls: "haiku" },
  { nome: "Dedupe", papel: "slug + similaridade · novo? enriquece?", modelo: "Haiku+emb", cls: "haiku" },
  { nome: "Pesquisador", papel: "apura ≥2 fontes (WebSearch)", modelo: "Sonnet", cls: "sonnet" },
  { nome: "Validador", papel: "regra das 2 fontes + confiança", modelo: "Sonnet", cls: "sonnet" },
  { nome: "Analista", papel: "monta o dossiê PT-BR", modelo: "Opus", cls: "opus" },
];
const FASE_B: Ag[] = [
  { nome: "Supervisor de Vendas", papel: "produto + CTA + disclosure CONAR", modelo: "Sonnet", cls: "sonnet" },
  { nome: "Carrossel", papel: "slides na voz da marca", modelo: "Sonnet", cls: "sonnet" },
  { nome: "Diretor de Arte", papel: "prompt de imagem correto (BJJ)", modelo: "Opus", cls: "opus" },
  { nome: "Empacotador", papel: "pacotes por plataforma (copiar-colar)", modelo: "Sonnet", cls: "sonnet" },
  { nome: "Avaliador", papel: "quality gate · aprova/rejeita", modelo: "Haiku", cls: "haiku" },
  { nome: "Render + imagegen", papel: "HTML→PNG · arte Gemini/GPT/Runway", modelo: "código+IA", cls: "img" },
];

function Node({ a }: { a: Ag }) {
  return (
    <div className="anode">
      <div className="an-t"><b>{a.nome}</b><span>{a.papel}</span></div>
      <span className={`badge-m ${a.cls}`}>{a.modelo}</span>
    </div>
  );
}

export default function Agentes() {
  const dossiers = getDossiers().length;
  const pieces = getPieces().length;

  return (
    <>
      <div className="a-top">
        <div>
          <h1>Agentes</h1>
          <p className="sub">O pipeline — 11 papéis, roteamento de modelo por etapa, custo observável</p>
        </div>
      </div>

      <div className="howto">
        <div className="st"><span className="n">1</span><b>Radar</b> acha a pauta (RSS)</div><span className="arw">→</span>
        <div className="st"><span className="n">2</span><b>Analista</b> monta o dossiê</div><span className="arw">→</span>
        <div className="st"><span className="n">3</span><b>Gera</b> carrossel + arte</div><span className="arw">→</span>
        <div className="st"><span className="n">4</span><b>Você aprova</b></div><span className="arw">→</span>
        <div className="st"><span className="n">5</span><b>Publica</b></div>
      </div>

      <div className="agents-flow">
        <div className="lane">
          <div className="lane-h"><span className="ph a">Fase A</span> Inteligência — síncrona</div>
          {FASE_A.map((a) => <Node key={a.nome} a={a} />)}
        </div>
        <div className="pivot">
          <div className="piv-card">dossiê validado<span>{dossiers} na base</span></div>
          <div className="arw-v">▼</div>
        </div>
        <div className="lane">
          <div className="lane-h"><span className="ph b">Fase B</span> Geração — batch</div>
          {FASE_B.map((a) => <Node key={a.nome} a={a} />)}
        </div>
      </div>

      <div className="ag-note">
        <b>Estado:</b> RSS e dedupe rodam ao vivo (grátis). As etapas de IA (Haiku/Sonnet/Opus)
        disparam com a <code>ANTHROPIC_API_KEY</code>. {pieces} peça(s) já no fluxo.
      </div>
    </>
  );
}
