"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { contraste, temaValido, type Tema } from "@/lib/tema";
import { salvarTemaAction } from "../actions";

const CORES: { chave: keyof Tema["cores"]; rotulo: string; onde: string }[] = [
  { chave: "ink", rotulo: "Tinta", onde: "texto do portal e faixa escura" },
  { chave: "paper", rotulo: "Papel", onde: "fundo do portal" },
  { chave: "red", rotulo: "Acento", onde: "a cor da marca — links, botões, faixa da arte" },
  { chave: "teal", rotulo: "Secundária", onde: "faixa inferior dos slides" },
  { chave: "tealEscuro", rotulo: "Secundária escura", onde: "variação da faixa" },
];

const TEXTOS: { chave: keyof Tema["textos"]; rotulo: string; onde: string }[] = [
  { chave: "ticker", rotulo: "Faixa do topo", onde: "a tarja vermelha abaixo do menu" },
  { chave: "rodapeArte", rotulo: "Botão da arte", onde: "no rodapé de cada slide" },
  { chave: "assinatura", rotulo: "Assinatura", onde: "repetida na faixa inferior da arte" },
  { chave: "dominioArte", rotulo: "Domínio na arte", onde: "escrito no rodapé dos slides" },
];

export default function EditorTema({ inicial }: { inicial: Tema }) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [t, setT] = useState<Tema>(inicial);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");

  const mudou = JSON.stringify(t) !== JSON.stringify(inicial);
  // Valida enquanto digita: o operador vê o problema antes de tentar salvar.
  const problemas = temaValido(t).erros;
  const contrasteTexto = contraste(t.cores.ink, t.cores.paper);

  function set<K extends keyof Tema>(secao: K, campo: string, valor: string) {
    setT({ ...t, [secao]: { ...(t[secao] as object), [campo]: valor } });
    setAviso(""); setErros([]);
  }

  function salvar() {
    setErros([]); setAviso("");
    transicao(async () => {
      const r = await salvarTemaAction(t);
      if (!r.ok) return setErros(r.erros);
      setAviso("Salvo. O portal já mostra; a arte usa no próximo render.");
      router.refresh();
    });
  }

  return (
    <div className="tema-grid">
      <div>
        <section className="ed-bloco">
          <div className="ed-h"><h2>Cores</h2></div>
          {CORES.map((c) => (
            <div className="tema-linha" key={c.chave}>
              <input
                type="color"
                className="tema-cor"
                value={t.cores[c.chave]}
                onChange={(e) => set("cores", c.chave, e.target.value)}
                aria-label={c.rotulo}
              />
              <div className="tema-info">
                <b>{c.rotulo}</b>
                <span>{c.onde}</span>
              </div>
              <input
                className="ed-in tema-hex"
                value={t.cores[c.chave]}
                onChange={(e) => set("cores", c.chave, e.target.value)}
                aria-label={`${c.rotulo} em hexadecimal`}
              />
            </div>
          ))}
          <p className={`tema-contraste ${contrasteTexto < 4.5 ? "ruim" : ""}`}>
            Contraste texto/fundo: <b>{contrasteTexto.toFixed(1)}:1</b>
            {contrasteTexto < 4.5 ? " — abaixo de 4.5:1, fica ilegível" : " — legível"}
          </p>
        </section>

        <section className="ed-bloco">
          <div className="ed-h"><h2>Fontes</h2></div>
          <p className="chint">
            Nome exato da família. Fontes do Google carregam sozinhas; qualquer outra
            precisa estar instalada no servidor que gera a arte.
          </p>
          <div className="tema-linha">
            <div className="tema-info"><b>Display</b><span>manchetes e a marca</span></div>
            <input className="ed-in" value={t.fontes.display}
                   onChange={(e) => set("fontes", "display", e.target.value)} />
          </div>
          <div className="tema-linha">
            <div className="tema-info"><b>Corpo</b><span>texto corrido</span></div>
            <input className="ed-in" value={t.fontes.corpo}
                   onChange={(e) => set("fontes", "corpo", e.target.value)} />
          </div>
        </section>

        <section className="ed-bloco">
          <div className="ed-h"><h2>Frases fixas</h2></div>
          {TEXTOS.map((x) => (
            <div className="tema-linha col" key={x.chave}>
              <div className="tema-info"><b>{x.rotulo}</b><span>{x.onde}</span></div>
              <input className="ed-in" value={t.textos[x.chave]}
                     onChange={(e) => set("textos", x.chave, e.target.value)} />
            </div>
          ))}
        </section>
      </div>

      <aside className="tema-previa">
        <div className="ed-h"><h2>Prévia</h2></div>

        {/* Portal: as mesmas variáveis que o layout injeta. */}
        <div
          className="tema-mock portal"
          style={{
            background: t.cores.paper,
            color: t.cores.ink,
            ["--mred" as string]: t.cores.red,
          }}
        >
          <div className="mock-nav" style={{ background: t.cores.ink }}>
            <span style={{ fontFamily: `'${t.fontes.display}', Impact, sans-serif` }}>
              Aloha<span style={{ color: t.cores.red }}>BJJ</span>
            </span>
          </div>
          <div className="mock-ticker" style={{ background: t.cores.red }}>
            {t.textos.ticker.slice(0, 58)}…
          </div>
          <div className="mock-corpo">
            <span className="mock-kicker" style={{ color: t.cores.red }}>SUPERLUTAS</span>
            <h3 style={{ fontFamily: `'${t.fontes.display}', Impact, sans-serif` }}>
              Gordon Ryan vs Felipe Pena no ADCC
            </h3>
            <p style={{ fontFamily: `'${t.fontes.corpo}', system-ui, sans-serif` }}>
              Um parágrafo de exemplo para conferir como o corpo do texto fica com esta fonte.
            </p>
          </div>
        </div>

        {/* Arte: o slide, com a faixa e as frases fixas. */}
        <div className="tema-mock arte" style={{ background: t.cores.ink }}>
          <div className="mock-slide">
            <div className="mock-barra" style={{ background: t.cores.red }} />
            <div className="mock-txt">
              <span style={{ color: "#ffcfcf" }}>SUPERLUTA</span>
              <b style={{ fontFamily: `'${t.fontes.display}', Impact, sans-serif` }}>
                O QUE NINGUÉM VIU NA FINAL
              </b>
            </div>
          </div>
          <div className="mock-rodape" style={{ background: t.cores.red }}>
            {t.textos.rodapeArte}
          </div>
          <div className="mock-faixa" style={{ background: t.cores.tealEscuro }}>
            {t.textos.assinatura} · {t.textos.assinatura}
          </div>
        </div>
      </aside>

      <div className="ed-barra">
        <span className="ed-estado">
          {problemas.length > 0 ? `${problemas.length} problema(s)` : mudou ? "alterado" : "sem alteração"}
        </span>
        {(erros.length > 0 || problemas.length > 0) && (
          <ul className="tema-erros">
            {(erros.length ? erros : problemas).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {aviso && <span className="ed-ok">{aviso}</span>}
        <button
          type="button"
          className="btn primary"
          disabled={pendente || !mudou || problemas.length > 0}
          onClick={salvar}
        >
          {pendente ? "Salvando…" : "Salvar tema"}
        </button>
      </div>
    </div>
  );
}
