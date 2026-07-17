"use client";

import { useState } from "react";
import { salvarProduto, novoProduto } from "../actions";

type Product = {
  id: string; nome: string; manychat: string; tipo: string; prioridade: number | null;
  tags: string[]; gatilho: string; busca: string; url_base: string; cupom: string;
  desconto: string; disclosure_obrigatorio: boolean; gancho: string; cta_sugerido: string;
};

export default function CatalogEditor({ produtos, portal }: { produtos: Product[]; portal: string }) {
  const [novo, setNovo] = useState({ id: "", nome: "", manychat: "" });
  const [erroNovo, setErroNovo] = useState("");

  async function criar() {
    setErroNovo("");
    const r = await novoProduto(novo.id, novo.nome, novo.manychat);
    if (r.ok) location.reload();
    else setErroNovo(r.erro || "erro");
  }

  return (
    <div className="cat">
      {produtos.map((p) => <Card key={p.id} p={p} portal={portal} />)}

      <div className="cat-new">
        <h3>+ Novo produto</h3>
        <div className="cat-new-row">
          <input placeholder="id (ex: gi-competicao)" value={novo.id}
            onChange={(e) => setNovo({ ...novo, id: e.target.value })} />
          <input placeholder="nome" value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input placeholder="palavra ManyChat (ex: GI)" value={novo.manychat}
            onChange={(e) => setNovo({ ...novo, manychat: e.target.value.toUpperCase() })} />
          <button className="btn primary" onClick={criar} disabled={!novo.id}>Criar</button>
        </div>
        {erroNovo && <div className="ed-note err">{erroNovo}</div>}
      </div>
    </div>
  );
}

function Card({ p, portal }: { p: Product; portal: string }) {
  const [f, setF] = useState({
    nome: p.nome, manychat: p.manychat, tipo: p.tipo,
    prioridade: p.prioridade == null ? "" : String(p.prioridade),
    tags: p.tags.join(", "), gatilho: p.gatilho, busca: p.busca,
    url_base: p.url_base, cupom: p.cupom, desconto: p.desconto,
    disclosure_obrigatorio: p.disclosure_obrigatorio,
    gancho: p.gancho, cta_sugerido: p.cta_sugerido,
  });
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const set = (k: string, v: string | boolean) => { setF({ ...f, [k]: v }); setStatus(""); };

  async function save() {
    setStatus("salvando"); setErro("");
    const r = await salvarProduto(p.id, { ...f });
    if (r.ok) setStatus("salvo");
    else { setStatus("erro"); setErro(r.erro || ""); }
  }

  const temLink = /^https?:\/\//.test(f.url_base);
  const kw = (f.manychat || "").toUpperCase();

  return (
    <section className="cat-card">
      <header className="cat-head">
        <div>
          <span className="cat-id">{p.id}</span>
          <span className={`cat-tag ${p.tipo === "afiliado" ? "aff" : "own"}`}>{f.tipo}</span>
        </div>
        <button className="btn primary cat-save" onClick={save} disabled={status === "salvando"}>
          {status === "salvando" ? "…" : status === "salvo" ? "✓ Salvo" : "Salvar"}
        </button>
      </header>

      {/* o campo que vira dinheiro */}
      <label className="cat-money">
        <span>🔗 Link de afiliado <em>(url_base)</em></span>
        <input className={temLink ? "ok" : ""} value={f.url_base} placeholder="cole aqui o link real do programa de afiliado — vazio = ainda sem link"
          onChange={(e) => set("url_base", e.target.value)} />
        {kw && (
          <small className="cat-hint">
            No ManyChat, a palavra <b>{kw}</b> deve mandar: <code>{portal}/k/{kw}</code>
            {temLink ? " → vai pro link acima." : " → sem link ainda, cai no portal."}
          </small>
        )}
      </label>

      <div className="cat-grid">
        <L t="Nome"><input value={f.nome} onChange={(e) => set("nome", e.target.value)} /></L>
        <L t="Palavra ManyChat"><input value={f.manychat} onChange={(e) => set("manychat", e.target.value.toUpperCase())} /></L>
        <L t="Cupom"><input value={f.cupom} onChange={(e) => set("cupom", e.target.value)} /></L>
        <L t="Desconto"><input value={f.desconto} onChange={(e) => set("desconto", e.target.value)} /></L>
        <L t="Tipo"><input value={f.tipo} onChange={(e) => set("tipo", e.target.value)} /></L>
        <L t="Prioridade"><input value={f.prioridade} onChange={(e) => set("prioridade", e.target.value)} /></L>
        <L t="Tags (vírgula)" wide><input value={f.tags} onChange={(e) => set("tags", e.target.value)} /></L>
        <L t="Gatilho (quando usar)" wide><input value={f.gatilho} onChange={(e) => set("gatilho", e.target.value)} /></L>
        <L t="Busca (query marketplace)" wide><input value={f.busca} onChange={(e) => set("busca", e.target.value)} /></L>
        <L t="Gancho" wide><input value={f.gancho} onChange={(e) => set("gancho", e.target.value)} /></L>
        <L t="CTA sugerido" wide><input value={f.cta_sugerido} onChange={(e) => set("cta_sugerido", e.target.value)} /></L>
        <label className="cat-chk">
          <input type="checkbox" checked={f.disclosure_obrigatorio}
            onChange={(e) => set("disclosure_obrigatorio", e.target.checked)} />
          Disclosure CONAR obrigatório (#publi)
        </label>
      </div>
      {status === "erro" && <div className="ed-note err">{erro || "erro ao salvar"}</div>}
    </section>
  );
}

function L({ t, wide, children }: { t: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`cat-f ${wide ? "wide" : ""}`}><span>{t}</span>{children}</label>;
}
