"use client";

import { useState } from "react";
import { salvarChave } from "../actions";

type EnvVar = { key: string; secret: boolean; set: boolean; value: string };

const GROUPS: { titulo: string; match: RegExp }[] = [
  { titulo: "IA (texto)", match: /^ANTHROPIC/ },
  { titulo: "Imagem", match: /^(IMAGE_PROVIDER_ORDER|GEMINI|OPENAI|RUNWAY)/ },
  { titulo: "Afiliados", match: /^(AFFILIATE|AMAZON|ML_|SHOPEE)/ },
  { titulo: "Banco (Supabase)", match: /SUPABASE/ },
  { titulo: "Acesso ao painel", match: /^ADMIN_/ },
  { titulo: "Teto de gasto & outros", match: /.*/ },
];

export default function ConfigEditor({ vars }: { vars: EnvVar[] }) {
  const used = new Set<string>();
  return (
    <div className="cfg">
      {GROUPS.map((g) => {
        const items = vars.filter((v) => !used.has(v.key) && g.match.test(v.key));
        items.forEach((v) => used.add(v.key));
        if (!items.length) return null;
        return (
          <section key={g.titulo} className="cfg-sec">
            <h2 className="cfg-h">{g.titulo}</h2>
            {items.map((v) => <Row key={v.key} v={v} />)}
          </section>
        );
      })}
    </div>
  );
}

function Row({ v }: { v: EnvVar }) {
  const [val, setVal] = useState(v.secret ? "" : v.value);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  async function save() {
    if (v.secret && !val.trim()) { setStatus(""); return; } // não apaga segredo com campo vazio
    setStatus("salvando");
    try { await salvarChave(v.key, val); setStatus("salvo"); } catch { setStatus("erro"); }
  }
  return (
    <div className="cfg-row">
      <label className="cfg-k">
        {v.key}
        {v.secret && <span className={`cfg-dot ${v.set ? "on" : ""}`} title={v.set ? "configurada" : "vazia"} />}
      </label>
      <input
        className="cfg-in"
        type={v.secret ? "password" : "text"}
        value={val}
        onChange={(e) => { setVal(e.target.value); setStatus(""); }}
        placeholder={v.secret ? (v.set ? "•••• configurada — digite para trocar" : "vazia") : ""}
        autoComplete="off"
      />
      <button className="btn ghost cfg-save" onClick={save} disabled={status === "salvando"}>
        {status === "salvando" ? "…" : status === "salvo" ? "✓" : "Salvar"}
      </button>
    </div>
  );
}
