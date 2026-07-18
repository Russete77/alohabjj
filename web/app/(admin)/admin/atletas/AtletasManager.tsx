"use client";

import { useMemo, useState } from "react";
import { salvarAtleta, novoAtleta } from "../actions";

type Atleta = {
  slug: string; nome: string; x: string; bjjheroes: string;
  equipe: string; peso: string; tags: string[]; notas: string; temPerfil: boolean;
};

export default function AtletasManager({ atletas, perfis }: { atletas: Atleta[]; perfis: Record<string, string> }) {
  const [list, setList] = useState(atletas);
  const [sel, setSel] = useState(atletas[0]?.slug || "");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [novo, setNovo] = useState({ slug: "", nome: "" });

  const filtered = useMemo(
    () => list.filter((a) => a.nome.toLowerCase().includes(q.toLowerCase())),
    [list, q],
  );
  const a = list.find((x) => x.slug === sel);

  function upd(patch: Partial<Atleta>) {
    setList((l) => l.map((x) => (x.slug === sel ? { ...x, ...patch } : x)));
    setStatus("");
  }
  async function save() {
    if (!a) return;
    setStatus("salvando");
    const r = await salvarAtleta(a.slug, { nome: a.nome, x: a.x, bjjheroes: a.bjjheroes, equipe: a.equipe, peso: a.peso, tags: a.tags, notas: a.notas });
    setStatus(r.ok ? "salvo" : "erro");
  }
  async function criar() {
    const r = await novoAtleta(novo.slug, novo.nome);
    if (r.ok) location.reload();
    else alert(r.erro || "erro");
  }

  return (
    <div className="atl">
      <aside className="atl-list">
        <input className="atl-search" placeholder={`Buscar (${list.length} atletas)…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="atl-items">
          {filtered.map((x) => (
            <button key={x.slug} className={`atl-item ${x.slug === sel ? "on" : ""}`} onClick={() => { setSel(x.slug); setStatus(""); }}>
              <span>{x.nome}</span>
              <span className="atl-flags">{x.x && <b title="tem @X">𝕏</b>}{x.temPerfil && <b className="ok" title="perfil enriquecido">●</b>}</span>
            </button>
          ))}
        </div>
        <div className="atl-new">
          <input placeholder="slug" value={novo.slug} onChange={(e) => setNovo({ ...novo, slug: e.target.value })} />
          <input placeholder="nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <button className="btn ghost" onClick={criar} disabled={!novo.slug}>+ atleta</button>
        </div>
      </aside>

      {a && (
        <main className="atl-edit">
          <div className="atl-top">
            <h2>{a.nome}</h2>
            <button className="btn primary" onClick={save} disabled={status === "salvando"}>
              {status === "salvando" ? "…" : status === "salvo" ? "✓ Salvo" : "Salvar"}
            </button>
          </div>
          {status === "erro" && <div className="ed-note err">erro ao salvar</div>}
          <div className="atl-grid">
            <L t="Nome"><input value={a.nome} onChange={(e) => upd({ nome: e.target.value })} /></L>
            <L t="@ no X (Twitter)"><input value={a.x} placeholder="@handle" onChange={(e) => upd({ x: e.target.value })} /></L>
            <L t="BJJ Heroes (URL)" wide><input value={a.bjjheroes} onChange={(e) => upd({ bjjheroes: e.target.value })} /></L>
            <L t="Equipe"><input value={a.equipe} onChange={(e) => upd({ equipe: e.target.value })} /></L>
            <L t="Peso/categoria"><input value={a.peso} onChange={(e) => upd({ peso: e.target.value })} /></L>
            <L t="Tags (vírgula)" wide><input value={a.tags.join(", ")} onChange={(e) => upd({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></L>
            <L t="Notas" wide><textarea rows={2} value={a.notas} onChange={(e) => upd({ notas: e.target.value })} /></L>
          </div>

          <div className="atl-prof">
            <div className="atl-ph">Perfil enriquecido {perfis[a.slug] ? "" : "— ainda não gerado"}</div>
            {perfis[a.slug] ? (
              <pre className="atl-md">{perfis[a.slug]}</pre>
            ) : (
              <div className="empty">Rode <code>python -m orchestrator.enrich_athlete --slug {a.slug}</code> pra o agente buscar cartel, preparação e notícias (inclui o X se você preencher o @).</div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}

function L({ t, wide, children }: { t: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`atl-f ${wide ? "wide" : ""}`}><span>{t}</span>{children}</label>;
}
