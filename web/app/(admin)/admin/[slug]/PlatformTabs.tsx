"use client";

import { useState } from "react";
import type { PlatformPackages } from "@/lib/pieces";

type TabKey = "instagram_feed" | "instagram_reels" | "tiktok" | "youtube_shorts";
const TABS: { key: TabKey; label: string; cls: string }[] = [
  { key: "instagram_feed", label: "Instagram · Feed", cls: "ig" },
  { key: "instagram_reels", label: "Instagram · Reels", cls: "ig" },
  { key: "tiktok", label: "TikTok", cls: "tt" },
  { key: "youtube_shorts", label: "YouTube · Shorts", cls: "yt" },
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
  const [tab, setTab] = useState<TabKey>("instagram_feed");
  const p = platforms;

  return (
    <div className="ptabs">
      <div className="ptabs-bar">
        {TABS.filter((t) => p[t.key]).map((t) => (
          <button key={t.key} className={`ptab ${t.cls} ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "instagram_feed" && p.instagram_feed && (
        <div className="ppanel">
          <Field label="Legenda (feed)" value={p.instagram_feed.caption} note="1ª linha = disclosure · ≤2.200" />
          <Field label="1º comentário" value={p.instagram_feed.primeiro_comentario} note="resto das hashtags aqui" />
          <Field label="Texto alternativo (alt)" value={p.instagram_feed.alt_text} note="acessibilidade" />
        </div>
      )}
      {tab === "instagram_reels" && p.instagram_reels && (
        <div className="ppanel">
          <Field label="Gancho (3s)" value={p.instagram_reels.hook} />
          <Field label="Legenda (Reels)" value={p.instagram_reels.caption} />
          <Field label="Sugestão de áudio" value={p.instagram_reels.audio_sugestao} />
        </div>
      )}
      {tab === "tiktok" && p.tiktok && (
        <div className="ppanel">
          <div className="ai-flag">● Marque “Conteúdo gerado por IA” ao publicar (is_ai_generated: true) — exigência do TikTok</div>
          <Field label="Legenda" value={p.tiktok.caption} note="curta · <150 visíveis" />
          <Field label="Roteiro de fala (3s de gancho)" value={p.tiktok.roteiro_fala} />
          <Field label="Hashtags" value={p.tiktok.hashtags.join(" ")} />
        </div>
      )}
      {tab === "youtube_shorts" && p.youtube_shorts && (
        <div className="ppanel">
          <Field label="Título" value={p.youtube_shorts.titulo} note="≤100 caracteres" />
          <Field label="Descrição" value={p.youtube_shorts.descricao} />
          <Field label="Tags" value={p.youtube_shorts.tags.join(", ")} />
        </div>
      )}
    </div>
  );
}
