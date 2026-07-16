"use client";

import { useEffect, useRef } from "react";

// faixa (team = cor) por graduação = nível do modelo
const PRETA = "#111111", MARROM = "#6E4A34", ROXA = "#6B3FA0", AZUL = "#2F6BB0", BRANCA = "#E8E2D5";

type A = { id: string; name: string; role: string; belt: string; status: string; thoughts: string[] };

// ORDEM importa: preenche Tatame(5) → Escritório(4) → Estúdio(2), nas zonas fixas
const AGENTS: A[] = [
  // ── Tatame · Fase A (inteligência) ──
  { id: "radar", name: "Radar", role: "Haiku", belt: AZUL, status: "reading",
    thoughts: ["Lendo o feed do BJJ Scout…", "Pauta nova: ADCC West Coast Trials", "Relevância 8 — isso vira dossiê"] },
  { id: "dedupe", name: "Dedupe", role: "Haiku", belt: AZUL, status: "thinking",
    thoughts: ["Já temos algo do Gordon Ryan?", "Slug bate com a base? Não…", "Tópico novo ✓"] },
  { id: "pesquisador", name: "Pesquisador", role: "Sonnet", belt: ROXA, status: "reading",
    thoughts: ["Apurando em 2 fontes…", "IBJJF confirma o resultado?", "Anotando a procedência de cada fato"] },
  { id: "validador", name: "Validador", role: "Sonnet", belt: ROXA, status: "thinking",
    thoughts: ["1 fonte só → não confirmado", "Grafia: Meregali, não Meregalli", "Confiança: média"] },
  { id: "analista", name: "Analista", role: "Opus", belt: PRETA, status: "typing",
    thoughts: ["Montando o dossiê em PT-BR…", "Ângulo de conversão: curso 100kg", "Sem inventar placar"] },
  // ── Escritório · Vendas / Geração de texto ──
  { id: "supervisor", name: "Supervisor", role: "Sonnet", belt: MARROM, status: "thinking",
    thoughts: ["Qual produto encaixa aqui?", "Curso > BJJ3D > afiliado", "CONAR: precisa de #publi?"] },
  { id: "carrossel", name: "Carrossel", role: "Sonnet", belt: ROXA, status: "typing",
    thoughts: ["Gancho forte no slide 1…", "Uma ideia por slide", "Assinatura da marca no fecho"] },
  { id: "empacotador", name: "Empacotador", role: "Sonnet", belt: MARROM, status: "typing",
    thoughts: ["Legenda do Instagram…", "TikTok: marcar 'conteúdo de IA'", "Título do Short ≤ 100"] },
  { id: "avaliador", name: "Avaliador", role: "Haiku", belt: BRANCA, status: "reading",
    thoughts: ["Avaliando a peça…", "Placar inventado? Não", "Aprovado ✓ nota 9/10"] },
  // ── Estúdio · Arte / Vídeo ──
  { id: "arte", name: "Diretor de Arte", role: "Opus", belt: PRETA, status: "thinking",
    thoughts: ["Prompt do hero: guarda vs passagem", "Sem judô, sem pose íntima", "Vermelho como aresta"] },
  { id: "render", name: "Render + IA", role: "código", belt: MARROM, status: "typing",
    thoughts: ["HTML → PNG dos slides…", "Gemini gera o hero", "Renderizando 6 slides"] },
];

export default function AgentTownView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let town: any;
    let timer: ReturnType<typeof setInterval>;
    let pollTimer: ReturnType<typeof setInterval>;
    let alive = true;

    (async () => {
      const { AgentTown } = await import("@/lib/agent-town");
      if (!alive || !ref.current) return;
      town = new AgentTown({
        container: ref.current,
        environment: "dojo",
        officeSize: "small", // grid menor = personagens maiores
      });
      // spawn com status fixo + 1º pensamento (a ordem casa com as zonas fixas)
      for (const a of AGENTS) {
        town.addAgent({ id: a.id, name: a.name, role: a.role, team: a.belt, status: a.status, message: a.thoughts[0] });
      }

      // ponte com o pipeline real: quando algum agente estiver rodando (jobs/),
      // o balão mostra o trabalho de verdade; senão, cai no roteiro demo.
      const live = new Map<string, string>();
      const poll = async () => {
        try {
          const r = await fetch("/api/agents/activity", { cache: "no-store" });
          const d = await r.json();
          live.clear();
          for (const [id, v] of Object.entries<any>(d.agents ?? {})) live.set(id, v.message);
        } catch { /* offline: usa demo */ }
      };
      poll();
      pollTimer = setInterval(poll, 2500);

      // balões sempre visíveis: só troca a MENSAGEM (não o status → não anda)
      let tick = 0;
      timer = setInterval(() => {
        if (!town) return;
        for (const a of AGENTS) {
          const msg = live.get(a.id) ?? a.thoughts[tick % a.thoughts.length];
          town.updateAgent(a.id, { message: msg });
        }
        tick++;
      }, 3500);
    })();

    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(pollTimer);
      town?.destroy?.();
    };
  }, []);

  return <div ref={ref} className="town-canvas" />;
}
