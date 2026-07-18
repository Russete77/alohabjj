"use client";

import { useEffect, useRef, useState } from "react";

// faixa (team = cor) por graduação = nível do modelo
const PRETA = "#111111", MARROM = "#6E4A34", ROXA = "#6B3FA0", AZUL = "#2F6BB0", BRANCA = "#E8E2D5";

type A = { id: string; name: string; role: string; belt: string };
// ORDEM importa: preenche Tatame(5) → Escritório(4) → Estúdio(2), nas zonas fixas
const AGENTS: A[] = [
  { id: "radar", name: "Radar", role: "Haiku", belt: AZUL },
  { id: "dedupe", name: "Dedupe", role: "Haiku", belt: AZUL },
  { id: "pesquisador", name: "Pesquisador", role: "Sonnet", belt: ROXA },
  { id: "validador", name: "Validador", role: "Sonnet", belt: ROXA },
  { id: "analista", name: "Analista", role: "Opus", belt: PRETA },
  { id: "supervisor", name: "Supervisor", role: "Sonnet", belt: MARROM },
  { id: "carrossel", name: "Carrossel", role: "Sonnet", belt: ROXA },
  { id: "empacotador", name: "Empacotador", role: "Sonnet", belt: MARROM },
  { id: "avaliador", name: "Avaliador", role: "Haiku", belt: BRANCA },
  { id: "arte", name: "Diretor de Arte", role: "Opus", belt: PRETA },
  { id: "render", name: "Render + IA", role: "código", belt: MARROM },
];

export default function AgentTownView() {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let town: any;
    let pollTimer: ReturnType<typeof setInterval>;
    let alive = true;

    (async () => {
      const { AgentTown } = await import("@/lib/agent-town");
      if (!alive || !ref.current) return;
      town = new AgentTown({ container: ref.current, environment: "dojo", officeSize: "small" });
      // spawn TODOS ociosos (sem balão) — só acende quando trabalham de verdade
      for (const a of AGENTS) {
        town.addAgent({ id: a.id, name: a.name, role: a.role, team: a.belt, status: "idle", message: "" });
      }

      // FIEL AO REAL: lê jobs/ (últimos 150s). Agente rodando → verbo real; senão → ocioso.
      const shown = new Map<string, string>(); // só atualiza na MUDANÇA (não reseta a cada tick)
      const poll = async () => {
        let d: any = { live: false, agents: {} };
        try {
          const r = await fetch("/api/agents/activity", { cache: "no-store" });
          d = await r.json();
        } catch { /* offline */ }
        if (!town) return;
        setLive(!!d.live);
        for (const a of AGENTS) {
          const l = d.agents?.[a.id];
          if (l) {
            const sig = `${l.status}|${l.message}`;
            if (shown.get(a.id) !== sig) { town.updateAgent(a.id, { status: l.status, message: l.message }); shown.set(a.id, sig); }
          } else if (shown.get(a.id) !== "__idle") {
            town.updateAgent(a.id, { status: "idle", message: "" }); shown.set(a.id, "__idle");
          }
        }
      };
      poll();
      pollTimer = setInterval(poll, 2000);
    })();

    return () => { alive = false; clearInterval(pollTimer); town?.destroy?.(); };
  }, []);

  return (
    <div className="town-wrap">
      <div className={`town-status ${live ? "on" : ""}`}>
        <span className="dot" />{live ? "ao vivo — agentes trabalhando" : "ocioso — dispare o pipeline acima pra ver os agentes em ação"}
      </div>
      <div ref={ref} className="town-canvas" />
    </div>
  );
}
