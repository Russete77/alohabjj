"use client";

import { useCallback, useEffect, useState } from "react";
import type { Atividade, Estado } from "./tipos";

/**
 * Console ao vivo do pipeline.
 *
 * Substitui a visualização pixel-art (bonequinhos de kimono andando numa
 * academia). Ela era bonita e não respondia nenhuma pergunta de operação: pra
 * saber QUAL dossiê estava sendo processado, com que modelo, há quanto tempo e
 * quanto tinha custado, você acabava abrindo `jobs/*.jsonl` no terminal. Aqui
 * essas quatro respostas são o próprio conteúdo da tela.
 */

/** 4 s: rápido o bastante pra parecer ao vivo (as etapas duram 10-60 s) e
 *  o dobro do intervalo antigo, que batia na rota 30x por minuto à toa. */
const INTERVALO_MS = 4000;

const ESTADOS: Record<Estado, string> = {
  rodando: "rodando",
  feito: "feito",
  erro: "erro",
  interrompido: "interrompido",
};

/** "há quanto tempo" em português curto, do jeito que se lê num console. */
function faz(seg: number): string {
  if (seg < 5) return "agora";
  if (seg < 60) return `${Math.round(seg)}s`;
  if (seg < 3600) return `${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `${Math.floor(seg / 3600)} h`;
  return `${Math.floor(seg / 86400)} d`;
}

function duracao(seg: number): string {
  if (seg < 60) return `${seg}s`;
  return `${Math.floor(seg / 60)}min ${seg % 60}s`;
}

const dolar = (v: number) => `$${v.toFixed(3)}`;

export default function ConsoleAoVivo() {
  const [dados, setDados] = useState<Atividade | null>(null);
  const [offline, setOffline] = useState(false);
  // Marca de quando a resposta chegou. As idades vêm calculadas no SERVIDOR
  // (`idadeSeg`) pra não depender do relógio do browser; somamos aqui o tempo
  // decorrido desde a resposta pra o contador andar entre um poll e outro.
  const [recebidoEm, setRecebidoEm] = useState(() => Date.now());
  const [, redesenha] = useState(0);

  const buscar = useCallback(async (vivo: () => boolean) => {
    try {
      const r = await fetch("/api/agents/activity", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const json = (await r.json()) as Atividade;
      if (!vivo()) return;
      setDados(json);
      setRecebidoEm(Date.now());
      setOffline(false);
    } catch {
      if (vivo()) setOffline(true);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    const vivo = () => ativo;
    buscar(vivo);
    const poll = setInterval(() => buscar(vivo), INTERVALO_MS);
    // Ticker separado só pra envelhecer os contadores na tela — não faz rede.
    const tique = setInterval(() => ativo && redesenha((n) => n + 1), 1000);
    return () => { ativo = false; clearInterval(poll); clearInterval(tique); };
  }, [buscar]);

  const deriva = (Date.now() - recebidoEm) / 1000;
  const idade = (base: number) => faz(base + deriva);

  const aoVivo = !!dados?.aoVivo;
  const etapas = dados?.etapas ?? [];
  const falhas = dados?.falhas ?? [];
  const janelaMin = Math.round((dados?.janelaVivaSeg ?? 180) / 60);
  const parou = etapas.some((e) => e.estado === "interrompido");

  return (
    <section className="cvivo">
      <header className="cvivo-top">
        <span className={`cvivo-farol ${aoVivo ? "on" : ""}`} />
        <b>
          {/* `dados === null` = ainda não perguntamos. Dizer "nenhum run recente"
              antes da primeira resposta seria afirmar o que não se sabe. */}
          {!dados && !offline ? "consultando…"
            : offline ? "sem resposta do painel"
            : aoVivo ? "ao vivo"
            : parou ? "último run — parou no meio"
            : etapas.length ? "último run (encerrado)"
            : "nenhum run recente"}
        </b>
        {dados?.runId && <code className="cvivo-run">{dados.runId}</code>}
        {!!dados?.custo && <span className="cvivo-custo">{dolar(dados.custo)}</span>}
      </header>

      {etapas.length === 0 ? (
        <p className="cvivo-vazio">
          {!dados && !offline ? (
            <>Lendo <code>jobs/</code>…</>
          ) : offline ? (
            <>Não consegui falar com <code>/api/agents/activity</code>. O painel continua tentando a cada {INTERVALO_MS / 1000}s.</>
          ) : (
            <>Sem etapas nos <b>últimos {janelaMin} min</b> e nenhum run recente em <code>jobs/</code>.
              Dispare o pipeline no painel acima que as etapas aparecem aqui.</>
          )}
        </p>
      ) : (
        <ol className="cvivo-lista">
          {etapas.map((e) => (
            <li key={e.step} className={`cvivo-etapa ${e.estado}`}>
              <span className="cvivo-luz" aria-hidden />
              {/* Rótulo, nome cru da etapa e chave moram na MESMA célula: a chave é
                  um slug longo e, disputando coluna com as métricas, sobrava
                  "h…" na tela. Aqui ela fica com toda a largura da esquerda. */}
              <span className="cvivo-nome">
                <b>{e.rotulo}</b>
                <span className="cvivo-chave" title={e.chave || undefined}>
                  <code>{e.step}</code>
                  {e.chave && <em>{e.chave}</em>}
                </span>
              </span>
              <span className="cvivo-modelo">{e.modelo || "—"}</span>
              <span className="cvivo-valor">{e.custo ? dolar(e.custo) : "—"}</span>
              <span className="cvivo-quando">
                <i>{ESTADOS[e.estado]}</i>
                {" · "}
                {e.estado === "rodando" && e.duracaoSeg !== null
                  ? duracao(e.duracaoSeg)
                  : `há ${idade(e.idadeSeg)}`}
              </span>
              {e.estado === "interrompido" && (
                <span className="cvivo-aviso">
                  o run parou aqui — nenhum fim foi gravado pra esta etapa
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {falhas.length > 0 && (
        <div className="cvivo-falhas">
          <b>Falhou {falhas.length === 1 ? "1 etapa" : `${falhas.length} etapas`}</b>
          {falhas.map((f, i) => (
            <p key={`${f.step}-${i}`}>
              <code>{f.step}</code>
              {f.chave && <em>{f.chave}</em>}
              <span>{f.erro}</span>
              <i>há {idade(f.idadeSeg)}</i>
            </p>
          ))}
          <small>Log completo em <code>jobs/{dados?.runId ?? "*"}.jsonl</code></small>
        </div>
      )}
    </section>
  );
}
