"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPublicacao } from "../actions";

/**
 * Cria uma publicação escrita à mão.
 *
 * Pede só o título: o resto (texto, capa, tags, editoria) se preenche no editor,
 * que já existe. Pedir tudo de uma vez num formulário faria o operador encarar
 * uma parede antes de escrever a primeira frase.
 */
export default function NovaPublicacao() {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState("");

  function criar() {
    setErro("");
    transicao(async () => {
      const r = await criarPublicacao(titulo);
      if (!r.ok) return setErro(r.erro ?? "falhou");
      // Vai direto pro editor: criar e ficar na lista deixaria o operador
      // procurando o que acabou de criar.
      router.push(`/admin/conteudo/${r.slug}`);
    });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn primary nova-btn" onClick={() => setAberto(true)}>
        + Nova publicação
      </button>
    );
  }

  return (
    <div className="nova-caixa">
      <label className="csr" htmlFor="novo-titulo">Título da publicação</label>
      <input
        id="novo-titulo"
        className="ed-in"
        value={titulo}
        autoFocus
        placeholder="Ex.: Gordon Ryan volta ao ADCC em 2027"
        onChange={(e) => { setTitulo(e.target.value); setErro(""); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); criar(); }
          if (e.key === "Escape") setAberto(false);
        }}
      />
      <div className="nova-acoes">
        <button type="button" onClick={() => { setAberto(false); setErro(""); }}>Cancelar</button>
        <button type="button" className="primary" disabled={pendente || titulo.trim().length < 3} onClick={criar}>
          {pendente ? "Criando…" : "Criar e escrever"}
        </button>
      </div>
      {erro && <span className="pub-erro">{erro}</span>}
      <span className="chint">Nasce como rascunho. Você escreve, revê na prévia e publica.</span>
    </div>
  );
}
