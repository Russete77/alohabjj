"use client";

import { useState } from "react";
import { salvarFontes } from "../actions";

export default function FontesEditor({ initial }: { initial: string }) {
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const edited = content !== saved;

  async function save() {
    setStatus("salvando"); setErro("");
    const r = await salvarFontes(content);
    if (r.ok) { setSaved(content); setStatus("salvo"); }
    else { setStatus("erro"); setErro(r.erro || "YAML inválido"); }
  }

  return (
    <div className="ed-main">
      <div className="ed-top">
        <code className="ed-path">config/fontes.yaml{edited ? " ·" : ""}</code>
        <button className="btn primary" onClick={save} disabled={status === "salvando" || !edited}>
          {status === "salvando" ? "Salvando…" : status === "salvo" ? "✓ Salvo" : "Salvar"}
        </button>
      </div>
      {status === "salvo" && <div className="ed-note ok">Salvo (YAML válido). Vale no próximo run do Radar.</div>}
      {status === "erro" && <div className="ed-note err">{erro}</div>}
      <textarea className="ed-area" value={content} onChange={(e) => { setContent(e.target.value); setStatus(""); }} spellCheck={false} />
    </div>
  );
}
