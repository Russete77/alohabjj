"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIAS, LABEL_CATEGORIA, normalizaOrdem, type Categoria } from "@/lib/editorial";
import {
  apagarDossie,
  arquivarDossie,
  corrigirDossie,
  destacarDossie,
  reordenarDossie,
} from "../actions";
import PublishButton from "./PublishButton";

export interface LinhaProps {
  slug: string;
  titulo: string;
  categoria: Categoria;
  data: string;
  publicado: boolean;
  arquivado: boolean;
  destaque: boolean;
  ordem: number | null;
  motivo: string | null;
  aviso: string | null;
  /** false = deploy sem disco (Vercel): apagar tira só o registro. */
  temDisco: boolean;
}

export default function LinhaConteudo(d: LinhaProps) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();

  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(d.titulo);
  const [categoria, setCategoria] = useState<string>(d.categoria);
  const [ordem, setOrdem] = useState(d.ordem === null ? "" : String(d.ordem));

  const [apagando, setApagando] = useState(false);
  const [digitado, setDigitado] = useState("");

  const [erro, setErro] = useState("");

  /** Toda ação passa por aqui: mesma leitura de erro, mesmo refresh da lista. */
  function roda(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro("");
    transicao(async () => {
      const r = await fn();
      if (!r.ok) { setErro(r.erro ?? "falhou"); return; }
      router.refresh();
    });
  }

  function salvarCorrecao() {
    roda(async () => {
      const r = await corrigirDossie(d.slug, titulo, categoria);
      if (r.ok) setEditando(false);
      return r;
    });
  }

  // O campo de ordem só grava quando o operador sai dele ou aperta Enter —
  // gravar a cada tecla mandaria "1", "12", "123" pro banco em sequência.
  function salvarOrdem() {
    if (ordem === (d.ordem === null ? "" : String(d.ordem))) return;
    // o campo passa a mostrar o que o banco REALMENTE guardou: digitar "abc"
    // grava null, e deixar "abc" na tela seria a tela mentindo
    const n = normalizaOrdem(ordem);
    setOrdem(n === null ? "" : String(n));
    roda(() => reordenarDossie(d.slug, ordem));
  }

  const classe = [
    "crow",
    d.motivo ? "risco" : "",
    d.arquivado ? "arquivada" : "",
    d.destaque ? "destacada" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classe}>
      <div className="cinfo">
        {editando ? (
          <div className="cedit">
            <label className="csr" htmlFor={`t-${d.slug}`}>Título</label>
            <input
              id={`t-${d.slug}`}
              className="cedit-in"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarCorrecao()}
              placeholder="vazio devolve o título do arquivo"
            />
            <label className="csr" htmlFor={`c-${d.slug}`}>Editoria</label>
            <select
              id={`c-${d.slug}`}
              className="cedit-in cedit-sel"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{LABEL_CATEGORIA[c]}</option>
              ))}
            </select>
            <button type="button" className="primary" disabled={pendente} onClick={salvarCorrecao}>
              Salvar
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => { setEditando(false); setTitulo(d.titulo); setCategoria(d.categoria); }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <b>{d.titulo}</b>
            <div className="cmeta">
              <span className={`ceditoria ${d.categoria}`}>{LABEL_CATEGORIA[d.categoria]}</span>
              <span>{d.data || "sem data"}</span>
              <code className="cslug">{d.slug}</code>
              {d.destaque && <span className="cflag destaque">★ destaque</span>}
              {d.arquivado && <span className="cflag">arquivado</span>}
              {d.motivo && <span className="alerta">⚠ {d.motivo}</span>}
            </div>
          </>
        )}
        {erro && <span className="pub-erro">{erro}</span>}
      </div>

      {apagando ? (
        <div className="pub-confirm capagar">
          <b>Apagar para sempre?</b>
          {d.temDisco ? (
            <span>Some a linha do banco e os arquivos do disco. Não tem desfazer.</span>
          ) : (
            <span>
              Este deploy não tem disco: sai só o registro do banco. Os arquivos
              continuam no PC/repositório e voltam no próximo sync. Não tem desfazer.
            </span>
          )}
          <label className="csr" htmlFor={`d-${d.slug}`}>Digite o slug para confirmar</label>
          <input
            id={`d-${d.slug}`}
            className="cedit-in"
            value={digitado}
            placeholder={d.slug}
            autoComplete="off"
            onChange={(e) => setDigitado(e.target.value)}
          />
          <div className="pub-acoes">
            <button type="button" onClick={() => { setApagando(false); setDigitado(""); }}>
              Cancelar
            </button>
            <button
              type="button"
              className="danger"
              disabled={pendente || digitado.trim() !== d.slug}
              onClick={() => roda(() => apagarDossie(d.slug, digitado))}
            >
              Apagar
            </button>
          </div>
        </div>
      ) : (
        <div className="cacoes">
          <div className="cordem">
            <label className="csr" htmlFor={`o-${d.slug}`}>Posição na home</label>
            <input
              id={`o-${d.slug}`}
              className="cordem-in"
              type="number"
              value={ordem}
              disabled={pendente}
              placeholder="—"
              title="Posição na home: menor aparece primeiro. Vazio ordena por data."
              onChange={(e) => setOrdem(e.target.value)}
              onBlur={salvarOrdem}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>

          <button
            type="button"
            className={`cbtn ${d.destaque ? "on" : ""}`}
            disabled={pendente || d.arquivado}
            aria-pressed={d.destaque}
            aria-label={`Destaque na home: ${d.titulo}`}
            title={d.arquivado ? "arquivado não pode ser destaque" : "card grande da home"}
            onClick={() => roda(() => destacarDossie(d.slug, !d.destaque))}
          >
            {d.destaque ? "★" : "☆"} Destaque
          </button>

          {!d.arquivado && (
            <PublishButton slug={d.slug} publicado={d.publicado} aviso={d.aviso} />
          )}

          <button
            type="button"
            className="cbtn"
            disabled={pendente}
            onClick={() => roda(() => arquivarDossie(d.slug, !d.arquivado))}
          >
            {d.arquivado ? "Desarquivar" : "Arquivar"}
          </button>

          {!editando && (
            <button type="button" className="cbtn" disabled={pendente} onClick={() => setEditando(true)}>
              Corrigir
            </button>
          )}

          {/* "Corrigir" mexe no cabeçalho (título, editoria) sem sair da lista.
              "Editar" abre o texto, a capa e as tags, que precisam de espaço. */}
          <a className="cbtn" href={`/admin/conteudo/${d.slug}`}>Editar</a>
          <a className="cbtn" href={`/preview/${d.slug}`} target="_blank" rel="noreferrer">Prévia ↗</a>

          <button
            type="button"
            className="cbtn perigo"
            disabled={pendente}
            onClick={() => setApagando(true)}
          >
            Apagar
          </button>
        </div>
      )}
    </div>
  );
}
