"use client";

import { useState } from "react";
import { salvarChave } from "../actions";

type Ajuste = { key: string; valor: string | null; segredo: boolean };

const GRUPOS: { titulo: string; ajuda: string; match: RegExp }[] = [
  {
    titulo: "Teto de gasto",
    ajuda: "Por run e por dia, em dólares. O do dia soma todos os runs — é o que impede dez execuções de US$ 5 virarem US$ 50.",
    match: /_CAP_USD$/,
  },
  {
    titulo: "Comportamento dos agentes",
    ajuda: "Modelo dos scouts, ordem de provedor de imagem e janela de recência do Radar.",
    match: /^(SCOUT_MODEL|IMAGE_PROVIDER_ORDER|RADAR_MAX_AGE_DAYS|WEB_SEARCH_EXTRA_DOMAINS)$/,
  },
  {
    titulo: "Afiliados",
    ajuda: "Sem estas, todo /k, /r e /p cai no portal em vez de converter.",
    match: /^(AFFILIATE_ORDER|AMAZON|ML_|SHOPEE)/,
  },
  { titulo: "Outros", ajuda: "", match: /.*/ },
];

export default function ConfigEditor({ ajustes }: { ajustes: Ajuste[] }) {
  const usados = new Set<string>();
  return (
    <div className="cfg">
      {GRUPOS.map((g) => {
        const itens = ajustes.filter((a) => !usados.has(a.key) && g.match.test(a.key));
        itens.forEach((a) => usados.add(a.key));
        if (!itens.length) return null;
        return (
          <section key={g.titulo} className="cfg-sec">
            <h2 className="cfg-h">{g.titulo}</h2>
            {g.ajuda && <p className="chint">{g.ajuda}</p>}
            {itens.map((a) => <Linha key={a.key} a={a} />)}
          </section>
        );
      })}
    </div>
  );
}

function Linha({ a }: { a: Ajuste }) {
  // Segredo entra vazio: o servidor manda só "•••" e nunca o valor real, então
  // pré-preencher com a máscara faria o operador salvar bolinhas por engano.
  const [val, setVal] = useState(a.segredo ? "" : (a.valor ?? ""));
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const configurado = Boolean(a.valor);

  async function salvar() {
    if (a.segredo && !val.trim()) return; // campo vazio não apaga credencial
    setStatus("salvando"); setErro("");
    const r = await salvarChave(a.key, val);
    if (r.ok) {
      setStatus("salvo");
      if (a.segredo) setVal("");
    } else {
      setStatus("erro");
      setErro(r.erro ?? "falhou");
    }
  }

  return (
    <div className="cfg-row">
      <label className="cfg-k" htmlFor={`cfg-${a.key}`}>
        {a.key}
        {a.segredo && (
          <span
            className={`cfg-dot ${configurado ? "on" : ""}`}
            title={configurado ? "configurada" : "vazia"}
          />
        )}
      </label>
      <input
        id={`cfg-${a.key}`}
        className="cfg-in"
        type={a.segredo ? "password" : "text"}
        value={val}
        onChange={(e) => { setVal(e.target.value); setStatus(""); setErro(""); }}
        placeholder={
          a.segredo
            ? configurado ? "configurada — digite para trocar" : "vazia"
            : "usando o padrão"
        }
        autoComplete="off"
      />
      <button className="btn ghost cfg-save" onClick={salvar} disabled={status === "salvando"}>
        {status === "salvando" ? "…" : status === "salvo" ? "✓" : "Salvar"}
      </button>
      {erro && <span className="pub-erro">{erro}</span>}
    </div>
  );
}
