"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunButton({ task, label, primary }: { task: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "running">("idle");
  const router = useRouter();

  async function run() {
    if (state === "running") return;
    setState("running");
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const { runId } = await r.json();
      if (!runId) throw new Error("sem runId");
      // espera terminar (o script escreve [[DONE]] no log)
      for (let i = 0; i < 200; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const g = await fetch(`/api/run?id=${runId}`).then((x) => x.json());
        if (g.done) break;
      }
      router.refresh();
    } catch {
      // silencioso — o painel Agentes mostra o console completo
    } finally {
      setState("idle");
    }
  }

  return (
    <button className={`btn ${primary ? "primary" : "ghost"}`} onClick={run} disabled={state === "running"}>
      {state === "running" ? "rodando…" : label}
    </button>
  );
}
