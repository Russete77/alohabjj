"use client";

import { useRef, useState } from "react";
import { subirFonte, excluirFonte } from "../actions";

type SrcType = "image" | "audio" | "video" | "text" | "link";
type Source = {
  id: string; type: SrcType; title: string; notes: string; tags: string[];
  agents: string[]; filename?: string; ext?: string; url?: string; atleta?: string;
  size?: number; created: number;
};
const AGENTS = [
  { key: "all", label: "Todos" },
  { key: "art_director", label: "Arte" },
  { key: "carousel", label: "Texto/Carrossel" },
  { key: "voz", label: "Voz" },
  { key: "sales_supervisor", label: "Vendas" },
  { key: "research", label: "Pesquisa" },
];
const TYPES: { key: SrcType; label: string; icon: string }[] = [
  { key: "image", label: "Imagem", icon: "🖼️" },
  { key: "video", label: "Vídeo", icon: "🎬" },
  { key: "audio", label: "Voz/Áudio", icon: "🎙️" },
  { key: "text", label: "Texto", icon: "📄" },
  { key: "link", label: "Link", icon: "🔗" },
];

export default function SourcesManager({ sources, agentLabels }: { sources: Source[]; agentLabels: Record<string, string> }) {
  const [type, setType] = useState<SrcType>("image");
  const [agents, setAgents] = useState<string[]>(["all"]);
  const [status, setStatus] = useState<"" | "enviando" | "ok" | "erro">("");
  const [erro, setErro] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function toggleAgent(k: string) {
    setAgents((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("enviando"); setErro("");
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    agents.forEach((a) => fd.append("agents", a));
    const r = await subirFonte(fd);
    if (r.ok) { setStatus("ok"); formRef.current?.reset(); setAgents(["all"]); }
    else { setStatus("erro"); setErro(r.erro || "erro"); }
  }

  async function del(id: string) {
    if (!confirm("Excluir esta fonte? A IA deixa de usá-la.")) return;
    await excluirFonte(id);
    location.reload();
  }

  return (
    <div className="src">
      <form ref={formRef} className="src-form" onSubmit={submit}>
        <div className="src-types">
          {TYPES.map((t) => (
            <button type="button" key={t.key} className={`src-type ${type === t.key ? "on" : ""}`} onClick={() => setType(t.key)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="src-fields">
          <input name="title" placeholder="Título (ex: Foto Gordon Ryan ADCC)" required />

          {type === "link" && <input name="url" placeholder="https://… (artigo, vídeo, referência)" required />}

          {(type === "image" || type === "video" || type === "audio") && (
            <input type="file" name="file" required
              accept={type === "image" ? "image/*" : type === "video" ? "video/*" : "audio/*"} />
          )}

          {type === "text" && (
            <textarea name="notes" placeholder="Cole o texto que a IA deve usar (diretriz de marca, contexto, fatos…)" rows={5} required />
          )}
          {type !== "text" && (
            <textarea name="notes" placeholder="Observações / como a IA deve usar (opcional)" rows={2} />
          )}

          {type === "image" && (
            <input name="atleta" placeholder="Atleta (opcional) — vira referência p/ recontextualização. Ex: gordon-ryan" />
          )}

          <input name="tags" placeholder="Tags separadas por vírgula (nogi, adcc, marca…)" />

          <div className="src-agents">
            <span>Qual agente usa:</span>
            {AGENTS.map((a) => (
              <label key={a.key} className={agents.includes(a.key) ? "on" : ""}>
                <input type="checkbox" checked={agents.includes(a.key)} onChange={() => toggleAgent(a.key)} />
                {a.label}
              </label>
            ))}
          </div>

          <div className="src-actions">
            <button className="btn primary" type="submit" disabled={status === "enviando"}>
              {status === "enviando" ? "Enviando…" : "+ Adicionar fonte"}
            </button>
            {status === "ok" && <span className="src-ok">✓ Adicionada</span>}
            {status === "erro" && <span className="src-err">{erro}</span>}
          </div>
        </div>
      </form>

      <div className="src-list">
        <h2>Fontes cadastradas <span>({sources.length})</span></h2>
        {sources.length === 0 && <div className="empty">Nenhuma fonte ainda. Suba imagem, vídeo, voz, texto ou link acima.</div>}
        <div className="src-grid">
          {sources.map((s) => (
            <div key={s.id} className="src-card">
              <div className="src-prev">
                {s.type === "image" && <img src={`/api/fonte/${s.id}`} alt={s.title} />}
                {s.type === "video" && <video src={`/api/fonte/${s.id}`} controls />}
                {s.type === "audio" && <audio src={`/api/fonte/${s.id}`} controls />}
                {s.type === "link" && <a href={s.url} target="_blank" rel="noreferrer" className="src-link">🔗 {s.url}</a>}
                {s.type === "text" && <div className="src-txt">📄 {s.notes.slice(0, 180) || "(texto)"}{s.notes.length > 180 ? "…" : ""}</div>}
              </div>
              <div className="src-meta">
                <b>{s.title}</b>
                {s.atleta && <span className="src-badge">ref: {s.atleta}</span>}
                <div className="src-chips">
                  {s.agents.map((a) => <span key={a} className="src-chip">{agentLabels[a] || a}</span>)}
                </div>
                {s.tags.length > 0 && <div className="src-tags">{s.tags.join(" · ")}</div>}
              </div>
              <button className="src-del" onClick={() => del(s.id)} title="Excluir">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
