import fs from "node:fs";
import path from "node:path";

// Agrega os logs do pipeline (jobs/*.jsonl) → custo por dia/agente/modelo pro /admin/custos.
const ROOT = path.resolve(process.cwd(), "..");
const JOBS = path.join(ROOT, "jobs");

interface Ev {
  ts?: number; step?: string; status?: string; model?: string; cost_est?: number;
  in_tok?: number; cache_read_tok?: number; cache_write_tok?: number;
}
export interface Custos {
  total: number; hoje: number; semana: number;
  porAgente: { step: string; cost: number; n: number }[];
  porModelo: { model: string; cost: number; pct: number }[];
  porDia: { dia: string; cost: number }[];
  caps: { run: string; dia: string };
  // Aproveitamento do prompt caching: até o fix destes campos o pipeline calculava
  // cache_read/cache_write e jogava fora, então só chamadas NOVAS entram em `n`.
  cache: { read: number; write: number; input: number; pct: number; n: number };
}

function diaStr(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function custos(): Custos {
  const porAgente = new Map<string, { cost: number; n: number }>();
  const porModelo = new Map<string, number>();
  const porDia = new Map<string, number>();
  let total = 0, hoje = 0, semana = 0;
  let cRead = 0, cWrite = 0, cIn = 0, cN = 0;
  const now = Date.now() / 1000;
  const hojeStr = diaStr(now);
  const dias7 = new Set<string>();
  for (let i = 6; i >= 0; i--) dias7.add(diaStr(now - i * 86400));

  try {
    if (fs.existsSync(JOBS)) {
      for (const f of fs.readdirSync(JOBS)) {
        if (!f.endsWith(".jsonl")) continue;
        for (const ln of fs.readFileSync(path.join(JOBS, f), "utf-8").split("\n")) {
          if (!ln.trim()) continue;
          let e: Ev;
          try { e = JSON.parse(ln); } catch { continue; }
          const c = e.cost_est || 0;
          if (!c || e.status !== "succeeded") continue;
          total += c;
          const step = e.step || "?";
          const a = porAgente.get(step) ?? { cost: 0, n: 0 };
          a.cost += c; a.n += 1; porAgente.set(step, a);
          porModelo.set(e.model || "?", (porModelo.get(e.model || "?") ?? 0) + c);
          // Só linhas MEDIDAS entram na conta do cache: as antigas não têm o campo e
          // contariam como 0% de aproveitamento, o que seria mentira (não medido ≠ zero).
          if (e.cache_read_tok !== undefined || e.cache_write_tok !== undefined) {
            const r = e.cache_read_tok ?? 0, w = e.cache_write_tok ?? 0;
            cRead += r; cWrite += w; cIn += (e.in_tok ?? 0) + r + w; cN += 1;
          }
          if (e.ts) {
            const d = diaStr(e.ts);
            if (dias7.has(d)) { porDia.set(d, (porDia.get(d) ?? 0) + c); semana += c; }
            if (d === hojeStr) hoje += c;
          }
        }
      }
    }
  } catch { /* best effort */ }

  return {
    total, hoje, semana,
    porAgente: [...porAgente.entries()].map(([step, v]) => ({ step, ...v })).sort((a, b) => b.cost - a.cost),
    porModelo: [...porModelo.entries()].map(([model, cost]) => ({ model, cost, pct: total ? (cost / total) * 100 : 0 })).sort((a, b) => b.cost - a.cost),
    porDia: [...dias7].map((dia) => ({ dia, cost: porDia.get(dia) ?? 0 })),
    // defaults iguais aos do lib/claude.py — o painel não pode prometer teto diferente do que roda
    caps: { run: process.env.SPEND_CAP_USD || "10", dia: process.env.DAILY_SPEND_CAP_USD || "20" },
    cache: { read: cRead, write: cWrite, input: cIn, pct: cIn ? (cRead / cIn) * 100 : 0, n: cN },
  };
}
