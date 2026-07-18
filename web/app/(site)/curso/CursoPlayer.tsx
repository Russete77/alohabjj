"use client";

import { useMemo, useState } from "react";

type Aula = { titulo: string; video: string; descricao: string };
type Modulo = { titulo: string; aulas: Aula[] };

function ytEmbed(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export default function CursoPlayer({ modulos }: { modulos: Modulo[] }) {
  const flat = useMemo(
    () => modulos.flatMap((m, mi) => m.aulas.map((a, ai) => ({ ...a, mi, ai, mod: m.titulo }))),
    [modulos],
  );
  // começa na 1ª aula que tem vídeo; senão na primeira
  const start = Math.max(0, flat.findIndex((a) => ytEmbed(a.video)));
  const [sel, setSel] = useState(start === -1 ? 0 : start);
  const atual = flat[sel];
  const embed = atual ? ytEmbed(atual.video) : null;
  let n = 0;

  return (
    <div className="cp">
      <div className="cp-main">
        <div className="cp-video">
          {embed ? (
            <iframe src={embed} title={atual.titulo} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <div className="cp-soon"><span>▶</span><b>{atual?.titulo}</b><small>Vídeo em breve — liberação diária às 20h</small></div>
          )}
        </div>
        {atual?.descricao && <p className="cp-desc">{atual.descricao}</p>}
      </div>

      <aside className="cp-list">
        {modulos.map((m, mi) => (
          <div key={mi} className="cp-mod">
            <div className="cp-modt">{m.titulo}</div>
            {m.aulas.map((a, ai) => {
              const idx = n++;
              const has = !!ytEmbed(a.video);
              return (
                <button key={ai} className={`cp-aula ${idx === sel ? "on" : ""}`} onClick={() => setSel(idx)}>
                  <span className="cp-num">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="cp-tit">{a.titulo}</span>
                  <span className={`cp-badge ${has ? "on" : ""}`}>{has ? "▶" : "•"}</span>
                </button>
              );
            })}
          </div>
        ))}
      </aside>
    </div>
  );
}
