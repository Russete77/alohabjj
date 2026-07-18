"use client";

import { useState } from "react";
import { salvarCurso, novoCurso } from "../actions";

type Aula = { titulo: string; video: string; descricao: string };
type Modulo = { titulo: string; aulas: Aula[] };
type Rec = { nome: string; url: string; desc: string };
type Curso = {
  slug: string; titulo: string; subtitulo: string; descricao: string;
  gratis: boolean; badge: string; capa: string; modulos: Modulo[]; recomendados: Rec[];
};

function ytOk(u: string) {
  return !u || /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))[\w-]{6,}/.test(u);
}

export default function CursoManager({ cursos }: { cursos: Curso[] }) {
  const [list, setList] = useState<Curso[]>(cursos);
  const [i, setI] = useState(0);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({ slug: "", titulo: "" });
  const c = list[i];

  function upd(patch: Partial<Curso>) {
    setList((l) => l.map((x, n) => (n === i ? { ...x, ...patch } : x)));
    setStatus("");
  }
  function updAula(mi: number, ai: number, patch: Partial<Aula>) {
    upd({ modulos: c.modulos.map((m, x) => x !== mi ? m : { ...m, aulas: m.aulas.map((a, y) => y === ai ? { ...a, ...patch } : a) }) });
  }
  function updModTitulo(mi: number, titulo: string) {
    upd({ modulos: c.modulos.map((m, x) => x === mi ? { ...m, titulo } : m) });
  }
  function addAula(mi: number) {
    upd({ modulos: c.modulos.map((m, x) => x === mi ? { ...m, aulas: [...m.aulas, { titulo: "", video: "", descricao: "" }] } : m) });
  }
  function delAula(mi: number, ai: number) {
    upd({ modulos: c.modulos.map((m, x) => x === mi ? { ...m, aulas: m.aulas.filter((_, y) => y !== ai) } : m) });
  }
  function addModulo() {
    upd({ modulos: [...c.modulos, { titulo: `Módulo ${c.modulos.length + 1}`, aulas: [] }] });
  }
  function delModulo(mi: number) {
    if (!confirm("Remover este módulo e suas aulas?")) return;
    upd({ modulos: c.modulos.filter((_, x) => x !== mi) });
  }

  async function save() {
    setStatus("salvando"); setErro("");
    const r = await salvarCurso(c.slug, c);
    if (r.ok) setStatus("salvo");
    else { setStatus("erro"); setErro(r.erro || ""); }
  }
  async function criar() {
    const r = await novoCurso(novo.slug, novo.titulo);
    if (r.ok) location.reload();
    else alert(r.erro || "erro");
  }

  return (
    <div className="ced">
      <div className="ced-tabs">
        {list.map((x, n) => (
          <button key={x.slug} className={`ced-tab ${n === i ? "on" : ""}`} onClick={() => { setI(n); setStatus(""); }}>{x.titulo || x.slug}</button>
        ))}
        <a className="ced-view" href="/curso" target="_blank" rel="noreferrer">ver no site ↗</a>
      </div>

      {c && (
        <>
          <div className="ced-top">
            <code>config/cursos/{c.slug}.yaml</code>
            <button className="btn primary" onClick={save} disabled={status === "salvando"}>
              {status === "salvando" ? "Salvando…" : status === "salvo" ? "✓ Salvo" : "Salvar curso"}
            </button>
          </div>
          {status === "salvo" && <div className="ed-note ok">Salvo. Já aparece no /curso.</div>}
          {status === "erro" && <div className="ed-note err">{erro}</div>}

          <section className="ced-hero">
            <L t="Título"><input value={c.titulo} onChange={(e) => upd({ titulo: e.target.value })} /></L>
            <L t="Subtítulo"><input value={c.subtitulo} onChange={(e) => upd({ subtitulo: e.target.value })} /></L>
            <L t="Selo (badge)"><input value={c.badge} onChange={(e) => upd({ badge: e.target.value })} /></L>
            <L t="Descrição" wide><textarea rows={2} value={c.descricao} onChange={(e) => upd({ descricao: e.target.value })} /></L>
            <label className="ced-chk"><input type="checkbox" checked={c.gratis} onChange={(e) => upd({ gratis: e.target.checked })} /> Curso grátis</label>
          </section>

          {c.modulos.map((m, mi) => (
            <section key={mi} className="ced-mod">
              <div className="ced-mhead">
                <input className="ced-mtit" value={m.titulo} onChange={(e) => updModTitulo(mi, e.target.value)} placeholder={`Módulo ${mi + 1}`} />
                <button className="ced-del" onClick={() => delModulo(mi)}>remover módulo</button>
              </div>
              {m.aulas.map((a, ai) => (
                <div key={ai} className="ced-aula">
                  <div className="ced-arow">
                    <span className="ced-an">{ai + 1}</span>
                    <input className="ced-atit" value={a.titulo} placeholder="Título da aula" onChange={(e) => updAula(mi, ai, { titulo: e.target.value })} />
                    <button className="ced-x" onClick={() => delAula(mi, ai)} title="remover aula">✕</button>
                  </div>
                  <input className={`ced-vid ${ytOk(a.video) ? "" : "bad"}`} value={a.video} placeholder="Link do vídeo (YouTube) — cole aqui" onChange={(e) => updAula(mi, ai, { video: e.target.value })} />
                  {!ytOk(a.video) && <small className="ced-warn">não parece um link de YouTube válido</small>}
                  <textarea className="ced-adesc" rows={2} value={a.descricao} placeholder="Texto da aula (o que ensina)" onChange={(e) => updAula(mi, ai, { descricao: e.target.value })} />
                </div>
              ))}
              <button className="ced-add" onClick={() => addAula(mi)}>+ aula</button>
            </section>
          ))}
          <button className="ced-add mod" onClick={addModulo}>+ módulo</button>
        </>
      )}

      <div className="ced-new">
        <h3>+ Novo curso</h3>
        <div className="ced-newrow">
          <input placeholder="slug (ex: montada-inescapavel)" value={novo.slug} onChange={(e) => setNovo({ ...novo, slug: e.target.value })} />
          <input placeholder="título" value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
          <button className="btn primary" onClick={criar} disabled={!novo.slug}>Criar</button>
        </div>
        <small>Dica: o agente <code>build_course</code> monta o currículo pronto — depois você só cola os vídeos aqui.</small>
      </div>
    </div>
  );
}

function L({ t, wide, children }: { t: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`ced-f ${wide ? "wide" : ""}`}><span>{t}</span>{children}</label>;
}
