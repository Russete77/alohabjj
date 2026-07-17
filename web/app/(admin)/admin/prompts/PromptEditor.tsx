"use client";

import { useState } from "react";
import { salvarPrompt } from "../actions";

type Doc = { kind: "agent" | "config"; name: string; content: string };

export default function PromptEditor({ docs }: { docs: Doc[] }) {
  const [i, setI] = useState(0);
  const [contents, setContents] = useState(docs.map((d) => d.content));
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const cur = docs[i];
  if (!cur) return <div className="empty">Nenhum agente encontrado.</div>;

  const edited = contents[i] !== cur.content;
  const path = cur.kind === "agent" ? `agents/${cur.name}/system.md` : `config/${cur.name}`;

  function select(n: number) { setI(n); setStatus(""); }
  function edit(v: string) { const c = [...contents]; c[i] = v; setContents(c); setStatus(""); }
  async function save() {
    setStatus("salvando");
    try { await salvarPrompt(cur.kind, cur.name, contents[i]); cur.content = contents[i]; setStatus("salvo"); }
    catch { setStatus("erro"); }
  }

  return (
    <div className="ed">
      <aside className="ed-list">
        <div className="ed-group">Agentes ({docs.filter((d) => d.kind === "agent").length})</div>
        {docs.map((d, n) => d.kind === "agent" && (
          <button key={d.name} className={`ed-item ${n === i ? "on" : ""}`} onClick={() => select(n)}>{d.name}</button>
        ))}
        <div className="ed-group">Config</div>
        {docs.map((d, n) => d.kind === "config" && (
          <button key={d.name} className={`ed-item ${n === i ? "on" : ""}`} onClick={() => select(n)}>{d.name.replace(".md", "")}</button>
        ))}
      </aside>
      <div className="ed-main">
        <div className="ed-top">
          <code className="ed-path">{path}{edited ? " ·" : ""}</code>
          <button className="btn primary" onClick={save} disabled={status === "salvando" || !edited}>
            {status === "salvando" ? "Salvando…" : status === "salvo" ? "✓ Salvo" : "Salvar"}
          </button>
        </div>
        {status === "salvo" && <div className="ed-note ok">Salvo. Vale no próximo run do pipeline (o Python lê o .md a cada ciclo).</div>}
        {status === "erro" && <div className="ed-note err">Erro ao salvar. Veja o console.</div>}
        <textarea className="ed-area" value={contents[i]} onChange={(e) => edit(e.target.value)} spellCheck={false} />
      </div>
    </div>
  );
}
