"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarModelos } from "../actions";
import type { Etapa } from "./page";

const MODELOS = [
  { id: "haiku", rotulo: "Haiku" },
  { id: "sonnet", rotulo: "Sonnet" },
  { id: "opus", rotulo: "Opus" },
];

// Preço relativo por milhão de tokens, na mesma proporção de lib/claude.py.
const CUSTO: Record<string, number> = { haiku: 1, sonnet: 3, opus: 5 };

export default function EditorModelos({ etapas }: { etapas: Etapa[] }) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [escolhas, setEscolhas] = useState<Record<string, string>>(
    Object.fromEntries(etapas.map((e) => [e.etapa, e.atual])),
  );
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const mudou = etapas.some((e) => escolhas[e.etapa] !== e.atual);
  const foraDoPadrao = etapas.filter((e) => escolhas[e.etapa] !== e.padrao).length;

  function salvar() {
    setErro(""); setAviso("");
    transicao(async () => {
      // Grava só o que DIFERE do padrão. Config enxuta é config legível — e o
      // padrão pode melhorar num commit sem ficar congelado no banco.
      const diff = Object.fromEntries(
        etapas
          .filter((e) => escolhas[e.etapa] !== e.padrao)
          .map((e) => [e.etapa, escolhas[e.etapa]]),
      );
      const r = await salvarModelos(diff);
      if (!r.ok) return setErro(r.erro ?? "falhou");
      setAviso("Salvo. Vale no próximo run.");
      router.refresh();
    });
  }

  return (
    <div className="mod-lista">
      {etapas.map((e) => {
        const atual = escolhas[e.etapa];
        const fator = CUSTO[atual] / CUSTO[e.padrao];
        return (
          <div className={`mod-linha ${atual !== e.padrao ? "trocado" : ""}`} key={e.etapa}>
            <div className="mod-info">
              <b>{e.rotulo}</b>
              <span className="mono">{e.etapa}</span>
            </div>
            <div className="mod-opcoes" role="group" aria-label={e.rotulo}>
              {MODELOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`mod-op ${atual === m.id ? "on" : ""}`}
                  aria-pressed={atual === m.id}
                  onClick={() => { setEscolhas({ ...escolhas, [e.etapa]: m.id }); setAviso(""); }}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <span className={`mod-fator ${fator > 1 ? "caro" : fator < 1 ? "barato" : ""}`}>
              {atual === e.padrao
                ? "padrão"
                : fator > 1
                  ? `${fator.toFixed(1)}x mais caro`
                  : `${(1 / fator).toFixed(1)}x mais barato`}
            </span>
          </div>
        );
      })}

      <div className="ed-barra">
        <span className="ed-estado">{foraDoPadrao} fora do padrão</span>
        {erro && <span className="pub-erro">{erro}</span>}
        {aviso && <span className="ed-ok">{aviso}</span>}
        <button className="btn primary" disabled={pendente || !mudou} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
