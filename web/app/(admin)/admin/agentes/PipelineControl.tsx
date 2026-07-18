"use client";

import { useRef, useState } from "react";

type Task = { id: string; label: string; hint: string; needs?: "max" | "slug" | "tema" };
const TASKS: Task[] = [
  { id: "fase_a_free", label: "Triagem (grátis)", hint: "RSS + dedupe, sem IA — vê as pautas frescas" },
  { id: "fase_a", label: "Fase A — buscar notícias", hint: "Radar→Pesquisa→Validação→Dossiê", needs: "max" },
  { id: "carrossel", label: "Fase B — gerar carrossel", hint: "de um dossiê (slug)", needs: "slug" },
  { id: "plataformas", label: "Fase B — pacotes + arte", hint: "IG/TikTok/YT + story (slug)", needs: "slug" },
  { id: "atletas", label: "Enriquecer atletas", hint: "cartel + preparação + notícias/X", needs: "max" },
  { id: "produtos", label: "Caçar produtos", hint: "campeões de marketplace → candidatos", needs: "max" },
  { id: "curso", label: "Criar curso", hint: "currículo de um tema", needs: "tema" },
];

export default function PipelineControl() {
  const [task, setTask] = useState("fase_a_free");
  const [max, setMax] = useState(2);
  const [slug, setSlug] = useState("");
  const [tema, setTema] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const stop = useRef(false);
  const cur = TASKS.find((t) => t.id === task)!;

  async function poll(id: string) {
    while (!stop.current) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const r = await fetch(`/api/run?id=${id}`, { cache: "no-store" });
        const j = await r.json();
        setLog(j.log || "");
        if (j.done) { setDone(true); break; }
      } catch { /* keep polling */ }
    }
    setRunning(false);
  }

  async function run() {
    if (running) return;
    setRunning(true); setDone(false); setLog("iniciando…\n"); stop.current = false;
    try {
      const r = await fetch("/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, max, slug, tema }),
      });
      const j = await r.json();
      if (!r.ok || !j.runId) { setLog("erro: " + (j.error || "falha ao iniciar")); setRunning(false); return; }
      poll(j.runId);
    } catch (e) {
      setLog("erro: " + (e as Error).message); setRunning(false);
    }
  }

  const paga = task !== "fase_a_free";

  return (
    <div className="pctl">
      <div className="pctl-row">
        <select value={task} onChange={(e) => setTask(e.target.value)} disabled={running}>
          {TASKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {cur.needs === "max" && (
          <label className="pctl-n">qtd
            <input type="number" min={1} max={10} value={max} onChange={(e) => setMax(+e.target.value)} disabled={running} />
          </label>
        )}
        {cur.needs === "slug" && (
          <input className="pctl-in" placeholder="slug do dossiê (ex: helena-crevar-...)" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={running} />
        )}
        {cur.needs === "tema" && (
          <input className="pctl-in" placeholder='tema (ex: "montada inescapável")' value={tema} onChange={(e) => setTema(e.target.value)} disabled={running} />
        )}
        <button className="btn primary" onClick={run} disabled={running || (cur.needs === "slug" && !slug) || (cur.needs === "tema" && !tema)}>
          {running ? "▶ rodando…" : "▶ Rodar"}
        </button>
        {running && <button className="btn ghost" onClick={() => { stop.current = true; }}>parar de acompanhar</button>}
      </div>
      <div className="pctl-hint">{cur.hint}{paga && <span className="pctl-warn"> · gasta IA (o teto de gasto protege)</span>}</div>

      {(log || running) && (
        <pre className={`pctl-con ${done ? "done" : running ? "live" : ""}`}>{log}
          {running && !done && <span className="pctl-cursor">▋</span>}
        </pre>
      )}
    </div>
  );
}
