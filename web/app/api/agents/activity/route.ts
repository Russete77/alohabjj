import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// web/ fica dentro de bjj-lucas/ ; os logs do pipeline estão em ../jobs
const JOBS = path.resolve(process.cwd(), "..", "jobs");

// step do jobs/*.jsonl -> id do agente na visualização
const STEP2AGENT: Record<string, string> = {
  backfill_post: "radar", backfill_run: "radar",
  distill_voice: "analista", build_dossier: "analista", analista: "analista",
  pesquisador: "pesquisador", validador: "validador",
  supervisor: "supervisor", carrossel: "carrossel", avaliador: "avaliador",
  packager: "empacotador", imagegen: "render",
};

const VERBO: Record<string, string> = {
  radar: "varrendo fontes", analista: "montando dossiê", pesquisador: "apurando fontes",
  validador: "checando 2 fontes", supervisor: "escolhendo CTA", carrossel: "escrevendo slides",
  avaliador: "no quality gate", empacotador: "empacotando p/ redes", render: "gerando arte/PNG",
};

interface Ev { ts: number; step: string; status: string; key?: string; cost_est?: number }

export function GET() {
  const out: Record<string, { status: string; message: string }> = {};
  let live = false;
  try {
    if (!fs.existsSync(JOBS)) return Response.json({ live, agents: out });
    const now = Date.now() / 1000;
    const latest: Record<string, Ev> = {};
    for (const f of fs.readdirSync(JOBS)) {
      if (!f.endsWith(".jsonl")) continue;
      const lines = fs.readFileSync(path.join(JOBS, f), "utf-8").split("\n");
      for (const ln of lines) {
        if (!ln.trim()) continue;
        let e: Ev;
        try { e = JSON.parse(ln); } catch { continue; }
        const agent = STEP2AGENT[e.step];
        if (!agent || !e.ts || now - e.ts > 150) continue; // só eventos recentes (ao vivo)
        if (!latest[agent] || e.ts > latest[agent].ts) latest[agent] = e;
      }
    }
    for (const [agent, e] of Object.entries(latest)) {
      live = true;
      if (e.status === "running") {
        out[agent] = { status: "typing", message: `${VERBO[agent]} · ${(e.key ?? "").slice(0, 22)}…` };
      } else if (e.status === "succeeded") {
        const c = e.cost_est ? ` ($${e.cost_est.toFixed(3)})` : "";
        out[agent] = { status: "success", message: `feito ✓${c}` };
      } else if (e.status === "errored" || e.status === "refused") {
        out[agent] = { status: "error", message: "erro — ver jobs/" };
      }
    }
  } catch {
    /* melhor esforço */
  }
  return Response.json({ live, agents: out });
}
