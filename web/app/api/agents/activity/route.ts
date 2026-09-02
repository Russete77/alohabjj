// Rota do painel: protegida pelo middleware (matcher "/api/agents/:path*").
// Até 02/09 ela ficou FORA do matcher e respondia sem sessão, entregando os
// slugs que o pipeline estava processando, o modelo e o custo por chamada.
import fs from "node:fs";
import path from "node:path";
import type { Atividade, Estado, Etapa, Falha } from "@/app/(admin)/admin/agentes/tipos";

export const dynamic = "force-dynamic";

// web/ fica dentro de bjj-lucas/ ; os logs do pipeline estão em ../jobs
const JOBS = path.resolve(process.cwd(), "..", "jobs");

/* ── Por que esta rota lê tão pouco ──────────────────────────────────────────
 * A versão anterior abria TODOS os `jobs/*.jsonl` e fazia `split("\n")` no
 * conteúdo inteiro, a cada 2 s, só pra descartar quase tudo com um filtro de
 * "eventos dos últimos 150 s". O custo crescia com o histórico: hoje são 46
 * arquivos e ~195 KB, mas o diretório é append-only e nunca é podado — em alguns
 * meses de operação seriam dezenas de MB relidos 30x por minuto.
 *
 * O trabalho útil, porém, está sempre no fim de um punhado de arquivos novos.
 * Então filtramos em duas peneiras, da mais barata pra mais cara:
 *
 *   1. `stat` (não abre o arquivo): descarta quem não foi tocado nas últimas
 *      horas. Um run encerrado em julho nunca mais é lido.
 *   2. cauda: dos que sobraram, lê só os últimos KB. Um JSONL é append-only, os
 *      eventos recentes estão no fim; a primeira linha da cauda pode ter sido
 *      cortada no meio e é descartada.
 *
 * Resultado: leitura de tamanho LIMITADO (≤ MAX_ARQUIVOS × CAUDA_BYTES),
 * independente do tamanho que o diretório alcançar.
 * ───────────────────────────────────────────────────────────────────────────*/

/** Um evento é "ao vivo" se aconteceu nos últimos 3 min. Folga confortável sobre
 *  o polling de 4 s da tela — nenhuma etapa some entre dois refreshes. */
const JANELA_VIVA_SEG = 180;
/** Peneira 1: arquivo intocado há mais de 12 h nem é aberto. Generoso de
 *  propósito — `stat` é barato e é melhor abrir um arquivo à toa do que perder
 *  um run longo que ficou minutos sem escrever. */
const JANELA_ARQUIVO_SEG = 12 * 3600;
/** Teto duro de arquivos abertos por request, mesmo que muitos sejam recentes. */
const MAX_ARQUIVOS = 12;
/** Cauda lida por arquivo. ~64 KB cobrem centenas de eventos — muito mais do que
 *  cabe na janela ao vivo. */
const CAUDA_BYTES = 64 * 1024;
/** Quantas falhas mostrar. O console é um resumo, não o log completo. */
const MAX_FALHAS = 6;
/** Teto de linhas na tela. Um run típico tem 4-8 etapas; o teto existe pro caso
 *  de um run longo (backfill, lote de atletas) não virar uma lista infinita. */
const MAX_ETAPAS = 14;

/** Nomes legíveis. A tabela é um LUXO, não um filtro: etapa sem rótulo aqui
 *  aparece com o nome cru em vez de sumir — o mapa antigo conhecia 12 etapas e
 *  escondia calado as outras 14 que o pipeline realmente grava. */
const ROTULOS: Record<string, string> = {
  radar: "Radar de pautas",
  scout: "Scout de produtos",
  trend_scout: "Radar de tendências",
  athlete_scout: "Radar de atletas",
  pesquisador: "Pesquisador",
  validador: "Validador (2 fontes)",
  analista: "Analista (dossiê)",
  build_dossier: "Montagem do dossiê",
  distill_voice: "Destilação de voz",
  backfill_post: "Backfill do acervo",
  backfill_run: "Backfill (run)",
  supervisor: "Supervisor (CTA)",
  carrossel: "Carrossel",
  avaliador: "Quality gate",
  packager: "Empacotador",
  imagegen: "Geração de imagem",
  arte: "Direção de arte",
  diretor_arte: "Direção de arte",
  capa_visao: "Capa (visão)",
  content_strategist: "Estratégia de conteúdo",
  ideator_3d: "Ideias 3D",
  ideator_cursos: "Ideias de curso",
  afiliados: "Links de afiliado",
  instagram: "Pacote Instagram",
  tiktok: "Pacote TikTok",
  youtube: "Pacote YouTube",
  facebook: "Pacote Facebook",
  "fase-a": "Fase A (orquestração)",
};

const rotulo = (step: string) => ROTULOS[step] ?? step;

/** Uma linha do JSONL. Ver `lib/jobs.py` (JobLog.record) pro contrato completo. */
interface Ev {
  ts?: number;
  run_id?: string;
  step?: string;
  status?: string;
  key?: string;
  model?: string;
  cost_est?: number;
  t0?: number;
  t1?: number;
  error?: string;
}

const VAZIO: Atividade = {
  aoVivo: false, modo: "vazio", runId: null, custo: 0,
  etapas: [], falhas: [], janelaVivaSeg: JANELA_VIVA_SEG,
};

/** Lê só os últimos `CAUDA_BYTES` do arquivo, sem carregar o resto na memória. */
function lerCauda(arquivo: string): string {
  const fd = fs.openSync(arquivo, "r");
  try {
    const tamanho = fs.fstatSync(fd).size;
    const inicio = Math.max(0, tamanho - CAUDA_BYTES);
    const buf = Buffer.alloc(Math.min(tamanho, CAUDA_BYTES));
    if (buf.length === 0) return "";
    fs.readSync(fd, buf, 0, buf.length, inicio);
    const texto = buf.toString("utf-8");
    // Cortamos no meio de uma linha (e possivelmente no meio de um caractere
    // UTF-8): a primeira linha da cauda não é confiável, então some.
    return inicio > 0 ? texto.slice(texto.indexOf("\n") + 1) : texto;
  } finally {
    fs.closeSync(fd);
  }
}

/** Peneira 1: os arquivos recentes, do mais novo pro mais velho, só com `stat`. */
function arquivosRecentes(agora: number): string[] {
  const corte = (agora - JANELA_ARQUIVO_SEG) * 1000;
  const recentes: { nome: string; mtime: number }[] = [];
  for (const nome of fs.readdirSync(JOBS)) {
    if (!nome.endsWith(".jsonl")) continue;
    let mtime: number;
    try {
      mtime = fs.statSync(path.join(JOBS, nome)).mtimeMs;
    } catch {
      continue; // arquivo sumiu entre o readdir e o stat
    }
    if (mtime >= corte) recentes.push({ nome, mtime });
  }
  recentes.sort((a, b) => b.mtime - a.mtime);
  return recentes.slice(0, MAX_ARQUIVOS).map((r) => path.join(JOBS, r.nome));
}

function estadoDe(status: string | undefined): Estado | null {
  if (status === "running") return "rodando";
  if (status === "succeeded") return "feito";
  // "errored" é o que o pipeline grava hoje; "refused"/"failed" entram aqui se
  // algum passo novo usar outro nome — melhor mostrar como erro do que ignorar.
  if (status === "errored" || status === "refused" || status === "failed") return "erro";
  return null;
}

export function GET() {
  let atividade: Atividade = VAZIO;
  try {
    if (!fs.existsSync(JOBS)) return Response.json(VAZIO);

    const agora = Date.now() / 1000;
    const eventos: Ev[] = [];
    for (const arquivo of arquivosRecentes(agora)) {
      let cauda: string;
      try {
        cauda = lerCauda(arquivo);
      } catch {
        continue; // arquivo sumiu ou está travado — segue o baile
      }
      for (const linha of cauda.split("\n")) {
        if (!linha.trim()) continue;
        try {
          const e = JSON.parse(linha) as Ev;
          if (e.ts && e.step && e.status) eventos.push(e);
        } catch {
          /* linha truncada ou meio-escrita pelo pipeline agora mesmo */
        }
      }
    }
    if (eventos.length === 0) return Response.json(VAZIO);

    eventos.sort((a, b) => a.ts! - b.ts!);
    const maisNovo = eventos[eventos.length - 1];
    const aoVivo = agora - maisNovo.ts! <= JANELA_VIVA_SEG;

    // Escopo: com o pipeline rodando, mostramos a janela ao vivo (pode cruzar
    // dois runs encadeados, ex. fase A → carrossel). Parado, mostramos o último
    // run inteiro — um console que fica em branco 23 h por dia não serve pra nada,
    // e é justamente parado que o operador precisa ver o que falhou.
    const emFoco = aoVivo
      ? eventos.filter((e) => agora - e.ts! <= JANELA_VIVA_SEG)
      : eventos.filter((e) => e.run_id === maisNovo.run_id);

    // Uma linha por etapa: o evento mais recente vence (é o "estado atual").
    const ultimoPorStep = new Map<string, Ev>();
    let custo = 0;
    for (const e of emFoco) {
      ultimoPorStep.set(e.step!, e); // já ordenado por ts, o último sobrescreve
      custo += e.cost_est ?? 0;
    }

    const etapas: Etapa[] = [];
    for (const [step, e] of ultimoPorStep) {
      let estado = estadoDe(e.status);
      if (!estado) continue;
      // Etapa em `running` num run que parou de escrever há minutos: ninguém
      // gravou o fim dela. O processo morreu ali. Só decidimos isso quando o run
      // INTEIRO está frio — uma etapa lenta num run ativo continua "rodando".
      if (estado === "rodando" && !aoVivo) estado = "interrompido";
      etapas.push({
        step,
        rotulo: rotulo(step),
        estado,
        chave: e.key ?? "",
        modelo: e.model ?? "",
        custo: e.cost_est ?? 0,
        idadeSeg: Math.max(0, Math.round(agora - e.ts!)),
        duracaoSeg: e.t0 ? Math.max(0, Math.round((e.t1 ?? agora) - e.t0)) : null,
        runId: e.run_id ?? "",
      });
    }
    // O que exige ação vem primeiro — rodando (é o "agora"), depois o que ficou
    // pendurado; o resto, do mais recente pro mais antigo, que é a ordem em que
    // a coisa aconteceu, de trás pra frente.
    const peso = (s: Estado) => (s === "rodando" ? 0 : s === "interrompido" ? 1 : 2);
    etapas.sort((a, b) => peso(a.estado) - peso(b.estado) || a.idadeSeg - b.idadeSeg);
    etapas.length = Math.min(etapas.length, MAX_ETAPAS);

    // Falhas listadas à parte: se `pesquisador` errou no slug A e depois deu certo
    // no slug B, a linha da etapa mostra "feito" — mas o erro do A não pode sumir.
    const falhas: Falha[] = emFoco
      .filter((e) => estadoDe(e.status) === "erro")
      .reverse()
      .slice(0, MAX_FALHAS)
      .map((e) => ({
        step: e.step!,
        rotulo: rotulo(e.step!),
        chave: e.key ?? "",
        erro: (e.error ?? "sem detalhe no log").slice(0, 300),
        idadeSeg: Math.max(0, Math.round(agora - e.ts!)),
      }));

    atividade = {
      aoVivo,
      modo: etapas.length ? (aoVivo ? "vivo" : "ultimo") : "vazio",
      runId: maisNovo.run_id ?? null,
      custo,
      etapas,
      falhas,
      janelaVivaSeg: JANELA_VIVA_SEG,
    };
  } catch {
    /* melhor esforço: o console nunca derruba o painel */
  }
  return Response.json(atividade);
}
