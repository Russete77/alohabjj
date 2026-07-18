"use client";

import { useState } from "react";
import { aprovarCandidato, rejeitarCandidato } from "../actions";

type Candidate = {
  id: string; id_sugerido: string; nome: string; descricao: string; gancho: string;
  tags: string[]; cta_sugerido: string; manychat_word: string; categoria: string;
  tipo: string; score: number; motivo: string; fonte: string; external_url: string;
  imagem_url: string; preco: string; precisa_link: boolean; status: string;
  ideia_tiktok?: string; ideia_instagram?: string; vendas?: string;
};

export default function CandidatesManager({ candidates }: { candidates: Candidate[] }) {
  const [rows, setRows] = useState(candidates);
  const [busy, setBusy] = useState("");

  async function aprovar(id: string) {
    setBusy(id);
    const r = await aprovarCandidato(id);
    setBusy("");
    if (r.ok) {
      setRows((rs) => rs.map((c) => (c.id === id ? { ...c, status: "aprovado" } : c)));
      if (r.precisaLink) alert("Aprovado! Falta o link de afiliado — cole em /admin/catalogo.");
    } else alert(r.erro || "erro");
  }
  async function rejeitar(id: string) {
    setBusy(id);
    await rejeitarCandidato(id);
    setBusy("");
    setRows((rs) => rs.map((c) => (c.id === id ? { ...c, status: "rejeitado" } : c)));
  }

  const pend = rows.filter((c) => c.status === "proposto");
  const resto = rows.filter((c) => c.status !== "proposto");

  if (rows.length === 0)
    return (
      <div className="empty">
        Nenhum candidato ainda. Rode <code>python -m orchestrator.find_products</code> pra o
        Product Scout caçar campeões nos marketplaces.
      </div>
    );

  return (
    <div className="cnd">
      <div className="cnd-grid">
        {pend.map((c) => (
          <article key={c.id} className="cnd-card">
            <div className="cnd-img" style={c.imagem_url ? { backgroundImage: `url("${c.imagem_url}")` } : undefined}>
              <span className={`cnd-score ${c.score >= 8 ? "hi" : c.score >= 5 ? "mid" : "lo"}`}>{c.score}</span>
              {c.fonte && <span className="cnd-fonte">{c.fonte}</span>}
            </div>
            <div className="cnd-body">
              <h3>{c.nome}</h3>
              <p className="cnd-desc">{c.descricao}</p>
              <div className="cnd-meta">
                <span className="cnd-chip">{c.tipo}</span>
                <span className="cnd-chip">{c.categoria}</span>
                <span className="cnd-chip">MC: {c.manychat_word}</span>
                {c.preco && <span className="cnd-chip">{c.preco}</span>}
                {c.precisa_link && <span className="cnd-chip warn">precisa link</span>}
              </div>
              <div className="cnd-motivo">{c.motivo}</div>
              {(c.ideia_tiktok || c.ideia_instagram) && (
                <div className="cnd-ideias">
                  {c.ideia_tiktok && <div className="cnd-ideia"><b>🎵 TikTok</b> {c.ideia_tiktok}</div>}
                  {c.ideia_instagram && <div className="cnd-ideia"><b>📸 Instagram</b> {c.ideia_instagram}</div>}
                </div>
              )}
              {c.external_url && <a className="cnd-link" href={c.external_url} target="_blank" rel="noreferrer">ver no {c.fonte} ↗</a>}
              <div className="cnd-actions">
                <button className="btn primary" disabled={busy === c.id} onClick={() => aprovar(c.id)}>
                  {busy === c.id ? "…" : "✓ Aprovar"}
                </button>
                <button className="btn ghost" disabled={busy === c.id} onClick={() => rejeitar(c.id)}>Reprovar</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {resto.length > 0 && (
        <div className="cnd-done">
          <h2>Já decididos ({resto.length})</h2>
          {resto.map((c) => (
            <div key={c.id} className="cnd-row">
              <span className={`cnd-tag ${c.status}`}>{c.status}</span>
              <b>{c.nome}</b> <span className="cnd-dim">nota {c.score} · {c.categoria}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
