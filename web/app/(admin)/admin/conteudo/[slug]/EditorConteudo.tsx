"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizaTagLivre } from "@/lib/cms";
import { salvarConteudo, salvarTags } from "../../actions";

interface Props {
  slug: string;
  publicado: boolean;
  corpoOriginal: string;
  corpoAtual: string;
  imagemOriginal: string | null;
  imagemAtual: string | null;
  tags: string[];
  vocabulario: { tag: string; usos: number }[];
}

export default function EditorConteudo(p: Props) {
  const router = useRouter();
  const [pendente, transicao] = useTransition();
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const [corpo, setCorpo] = useState(p.corpoAtual);
  const [imagem, setImagem] = useState(p.imagemAtual ?? "");
  const [tags, setTags] = useState<string[]>(p.tags);
  const [nova, setNova] = useState("");
  const [verOriginal, setVerOriginal] = useState(false);

  const corpoMudou = corpo !== p.corpoAtual;
  const imagemMudou = (imagem || null) !== (p.imagemAtual ?? null);
  const tagsMudaram = tags.join("|") !== p.tags.join("|");
  const temMudanca = corpoMudou || imagemMudou || tagsMudaram;

  // Diferente do original = há uma correção humana em cima do que a IA escreveu.
  const corrigido = corpo !== p.corpoOriginal || (imagem || null) !== p.imagemOriginal;

  const sugestoes = useMemo(
    () => p.vocabulario.filter((v) => !tags.includes(v.tag)).slice(0, 24),
    [p.vocabulario, tags],
  );

  function addTag(bruta: string) {
    const t = normalizaTagLivre(bruta);
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setNova("");
  }

  function salvar() {
    setErro(""); setAviso("");
    transicao(async () => {
      if (corpoMudou || imagemMudou) {
        const r = await salvarConteudo(p.slug, {
          ...(corpoMudou ? { resumo: corpo } : {}),
          ...(imagemMudou ? { imagem: imagem || null } : {}),
        });
        if (!r.ok) return setErro(r.erro ?? "falhou");
      }
      if (tagsMudaram) {
        const r = await salvarTags(p.slug, tags);
        if (!r.ok) return setErro(r.erro ?? "falhou");
      }
      setAviso("Salvo.");
      router.refresh();
    });
  }

  function desfazerCorpo() {
    // Voltar ao original é gravar null, não colar o texto do arquivo por cima:
    // assim o dossiê volta a ACOMPANHAR o arquivo se o pipeline regerar.
    setErro(""); setAviso("");
    transicao(async () => {
      const r = await salvarConteudo(p.slug, { resumo: null });
      if (!r.ok) return setErro(r.erro ?? "falhou");
      setCorpo(p.corpoOriginal);
      setAviso("Correção desfeita — voltou a valer o que a IA escreveu.");
      router.refresh();
    });
  }

  return (
    <div className="ed-grid">
      <section className="ed-bloco">
        <div className="ed-h">
          <h2>Texto</h2>
          <div className="ed-acoes">
            {corpo !== p.corpoOriginal && (
              <button type="button" className="btn ghost" onClick={() => setVerOriginal(!verOriginal)}>
                {verOriginal ? "Esconder original" : "Ver o original"}
              </button>
            )}
            {corrigido && (
              <button type="button" className="btn ghost" disabled={pendente} onClick={desfazerCorpo}>
                Desfazer correção
              </button>
            )}
          </div>
        </div>
        <p className="chint">
          Um parágrafo por bloco, separados por linha em branco. O primeiro vira o
          lead — o parágrafo grande no topo do artigo.
        </p>
        <textarea
          className="ed-area"
          value={corpo}
          onChange={(e) => { setCorpo(e.target.value); setAviso(""); }}
          spellCheck
          rows={18}
        />
        {verOriginal && (
          <>
            <div className="ed-h" style={{ marginTop: 14 }}>
              <h2 className="ed-orig-t">O que a IA escreveu</h2>
            </div>
            <pre className="ed-orig">{p.corpoOriginal}</pre>
          </>
        )}
      </section>

      <aside className="ed-lado">
        <section className="ed-bloco">
          <div className="ed-h"><h2>Capa</h2></div>
          {imagem ? (
            <div className="ed-capa" style={{ backgroundImage: `url("${imagem}")` }} />
          ) : (
            <div className="ed-capa vazia">sem capa</div>
          )}
          <input
            className="ed-in"
            value={imagem}
            onChange={(e) => { setImagem(e.target.value); setAviso(""); }}
            placeholder="URL da imagem (https://…)"
            autoComplete="off"
          />
          {p.imagemOriginal && imagem !== p.imagemOriginal && (
            <button type="button" className="btn ghost" onClick={() => setImagem(p.imagemOriginal ?? "")}>
              Voltar à capa original
            </button>
          )}
        </section>

        <section className="ed-bloco">
          <div className="ed-h"><h2>Tags</h2></div>
          <p className="chint">
            É por elas que o Supervisor escolhe o produto do CTA. Tag errada gruda o
            produto errado na peça.
          </p>
          <div className="ed-tags">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className="ed-tag on"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                aria-label={`Remover ${t}`}
              >
                {t} <span aria-hidden>×</span>
              </button>
            ))}
            {tags.length === 0 && <span className="chint">nenhuma</span>}
          </div>

          <div className="ed-tag-nova">
            <input
              className="ed-in"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(nova); }
              }}
              placeholder="nova tag + Enter"
              autoComplete="off"
            />
          </div>

          {sugestoes.length > 0 && (
            <>
              <p className="chint" style={{ marginTop: 10 }}>Já usadas no acervo:</p>
              <div className="ed-tags">
                {sugestoes.map((v) => (
                  <button key={v.tag} type="button" className="ed-tag" onClick={() => addTag(v.tag)}>
                    {v.tag} <span className="ed-tag-n">{v.usos}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </aside>

      <div className="ed-barra">
        <a className="btn ghost" href={`/preview/${p.slug}`} target="_blank" rel="noreferrer">
          Ver como fica publicado ↗
        </a>
        <span className="ed-estado">
          {p.publicado ? "no ar" : "rascunho"}
          {corrigido && " · corrigido"}
        </span>
        {erro && <span className="pub-erro">{erro}</span>}
        {aviso && <span className="ed-ok">{aviso}</span>}
        <button
          type="button"
          className="btn primary"
          disabled={pendente || !temMudanca}
          onClick={salvar}
        >
          {pendente ? "Salvando…" : temMudanca ? "Salvar" : "Salvo"}
        </button>
      </div>
    </div>
  );
}
