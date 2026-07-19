"use client";

import { useState } from "react";
import type { PlatformPackages } from "@/lib/pieces";

type TabKey = "instagram" | "tiktok" | "facebook" | "youtube";
const TABS: { key: TabKey; label: string; cls: string }[] = [
  { key: "instagram", label: "Instagram", cls: "ig" },
  { key: "tiktok", label: "TikTok", cls: "tt" },
  { key: "facebook", label: "Facebook", cls: "fb" },
  { key: "youtube", label: "YouTube · Shorts", cls: "yt" },
];

function Field({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }
  return (
    <div className="pf">
      <div className="pf-h">
        <span className="pf-lab">{label}</span>
        {note && <span className="pf-note">{note}</span>}
        <button className="pf-copy" onClick={copy}>{copied ? "copiado ✓" : "copiar"}</button>
      </div>
      <pre className="pf-val">{value}</pre>
    </div>
  );
}

export default function PlatformTabs({ platforms }: { platforms: PlatformPackages }) {
  const p = platforms;
  const first = (TABS.find((t) => p[t.key])?.key ?? "instagram") as TabKey;
  const [tab, setTab] = useState<TabKey>(first);

  return (
    <div className="ptabs">
      <div className="ptabs-bar">
        {TABS.filter((t) => p[t.key]).map((t) => (
          <button key={t.key} className={`ptab ${t.cls} ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "instagram" && p.instagram && (
        <div className="ppanel">
          <Field label="Legenda (BR)" value={p.instagram.legenda_br} note="1ª linha = disclosure · ≤2.200" />
          {p.instagram.legenda_us && <Field label="Legenda (EN)" value={p.instagram.legenda_us} note="público internacional" />}
          {p.instagram.palavras_chave_extras?.length ? (
            <Field label="Hashtags extras" value={p.instagram.palavras_chave_extras.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")} note="jogue no 1º comentário" />
          ) : null}
          {p.instagram.headline_capa?.length ? (
            <Field label="Opções de headline de capa" value={p.instagram.headline_capa.map((h, i) => `${i + 1}. ${h}`).join("\n")} note="escolha 1 pro slide de capa" />
          ) : null}
        </div>
      )}

      {tab === "tiktok" && p.tiktok && (
        <div className="ppanel">
          <div className="ai-flag">● Marque "Conteúdo gerado por IA" ao publicar (is_ai_generated: true) — exigência do TikTok</div>
          {p.tiktok.emocao_dominante && <div className="pf-emo">Emoção dominante: <b>{p.tiktok.emocao_dominante}</b></div>}
          <Field label="🎬 Hook — o que FALAR nos 1-3s" value={p.tiktok.hook_fala} note="para o scroll na 1ª frase" />
          <Field label="📱 Hook — texto NA TELA (overlay)" value={p.tiktok.hook_tela} note="≤6 palavras, alto contraste" />

          <div className="pf">
            <div className="pf-h"><span className="pf-lab">🗺️ Roteiro por beats (grave assim)</span><span className="pf-note">tempo · fala · texto na tela</span></div>
            <div className="tt-beats">
              {p.tiktok.roteiro_beats?.map((b, i) => (
                <div className="tt-beat" key={i}>
                  <span className="tt-t">{b.tempo}</span>
                  <div className="tt-c">
                    <p className="tt-fala">🎙️ {b.fala}</p>
                    <p className="tt-tela">📱 {b.texto_tela}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Field label="🔊 Áudio sugerido" value={p.tiktok.audio_sugestao} note="som em alta empurra alcance" />
          <Field label="🔁 Gancho de loop (última frase)" value={p.tiktok.gancho_loop} note="conecta com o hook → puxa replay" />
          <Field label="💬 CTA de comentário (comment-to-DM)" value={p.tiktok.cta_comentario} note="comentário é combustível do Para Você" />
          <Field label="Legenda" value={p.tiktok.caption} note="curta · <150 visíveis" />
          <Field label="Hashtags" value={p.tiktok.hashtags.join(" ")} note="3–5 nicho + 1 amplo (#fyp)" />
        </div>
      )}

      {tab === "facebook" && p.facebook && (
        <div className="ppanel">
          {p.facebook.emocao_dominante && <div className="pf-emo">Emoção dominante: <b>{p.facebook.emocao_dominante}</b></div>}
          <Field label="1ª linha (decide o 'ver mais')" value={p.facebook.primeira_linha} note="o feed corta aqui" />
          <Field label="Legenda" value={p.facebook.legenda} note="lê-se inteira no Facebook" />
          {p.facebook.link_contexto ? <Field label="Contexto do link (tráfego)" value={p.facebook.link_contexto} note="por que clicar" /> : null}
          <Field label="💬 CTA de comentário" value={p.facebook.cta_comentario} note="puxa debate da comunidade" />
          <Field label="Hashtags" value={p.facebook.hashtags.join(" ")} note="enxutas (2–4)" />
        </div>
      )}

      {tab === "youtube" && p.youtube && (
        <div className="ppanel">
          <Field label="Título" value={p.youtube.titulo} note="≤100 caracteres · #Shorts" />
          <Field label="Descrição" value={p.youtube.descricao} />
          <Field label="Tags" value={p.youtube.tags.join(", ")} />
        </div>
      )}
    </div>
  );
}
