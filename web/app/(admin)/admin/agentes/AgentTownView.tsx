"use client";

import { useEffect, useRef } from "react";

// faixa (team = cor da faixa) por graduação = nível do modelo
const PRETA = "#111111", MARROM = "#6E4A34", ROXA = "#6B3FA0", AZUL = "#2F6BB0", BRANCA = "#E8E2D5";

type A = { id: string; name: string; role: string; belt: string };
const AGENTS: A[] = [
  { id: "radar", name: "Radar", role: "Haiku", belt: AZUL },
  { id: "dedupe", name: "Dedupe", role: "Haiku", belt: AZUL },
  { id: "pesquisador", name: "Pesquisador", role: "Sonnet", belt: ROXA },
  { id: "validador", name: "Validador", role: "Sonnet", belt: ROXA },
  { id: "analista", name: "Analista", role: "Opus", belt: PRETA },
  { id: "supervisor", name: "Supervisor", role: "Sonnet", belt: MARROM },
  { id: "carrossel", name: "Carrossel", role: "Sonnet", belt: ROXA },
  { id: "arte", name: "Diretor de Arte", role: "Opus", belt: PRETA },
  { id: "empacotador", name: "Empacotador", role: "Sonnet", belt: MARROM },
  { id: "avaliador", name: "Avaliador", role: "Haiku", belt: BRANCA },
  { id: "render", name: "Render + IA", role: "código", belt: MARROM },
];

// passo a passo do pipeline (status → animação do boneco)
const STEPS: { id: string; status: string; msg: string }[] = [
  { id: "radar", status: "reading", msg: "Lendo RSS das fontes…" },
  { id: "dedupe", status: "thinking", msg: "Tópico novo ou já existe?" },
  { id: "pesquisador", status: "reading", msg: "Apurando ≥2 fontes…" },
  { id: "validador", status: "thinking", msg: "Regra das 2 fontes" },
  { id: "analista", status: "typing", msg: "Montando o dossiê…" },
  { id: "supervisor", status: "thinking", msg: "Escolhendo produto + CTA" },
  { id: "carrossel", status: "typing", msg: "Escrevendo os slides…" },
  { id: "arte", status: "typing", msg: "Prompt do hero (BJJ)…" },
  { id: "empacotador", status: "typing", msg: "IG · TikTok · Shorts" },
  { id: "avaliador", status: "reading", msg: "Quality gate…" },
  { id: "render", status: "typing", msg: "HTML→PNG + arte" },
];

export default function AgentTownView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let town: any;
    let timer: ReturnType<typeof setInterval>;
    let alive = true;

    (async () => {
      const { AgentTown } = await import("@/lib/agent-town");
      if (!alive || !ref.current) return;
      town = new AgentTown({
        container: ref.current,
        environment: "dojo",     // tatame aberto (academia AlohaBJJ)
        officeSize: "medium",    // personagens maiores (kimono + faixa visíveis)
      });
      for (const a of AGENTS) {
        town.addAgent({ id: a.id, name: a.name, role: a.role, team: a.belt, status: "idle" });
      }

      // simulação calma e sequencial do pipeline (só um "ativo" por vez)
      let i = 0;
      timer = setInterval(() => {
        if (!town) return;
        const step = STEPS[i % STEPS.length];
        const prev = STEPS[(i - 1 + STEPS.length) % STEPS.length];
        town.updateAgent(prev.id, { status: "idle", message: null });
        town.updateAgent(step.id, { status: step.status, message: step.msg });
        i++;
      }, 2600);
    })();

    return () => {
      alive = false;
      clearInterval(timer);
      town?.destroy?.();
    };
  }, []);

  return <div ref={ref} className="town-canvas" />;
}
