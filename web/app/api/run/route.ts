import { NextResponse, type NextRequest } from "next/server";
import { dbEnabled, dbSelect, dbUpsert } from "@/lib/server-db";

// O painel PEDE; quem EXECUTA é o orchestrator/worker.py.
//
// POR QUE MUDOU: até aqui esta rota fazia `spawn("python", args)` — disparava o
// pipeline dentro do processo que serve o painel. Isso só funciona na máquina do
// dono. Na Vercel não existe python, não existe o repositório e o disco é
// efêmero: o botão respondia com um runId, o console ao vivo tentava ler
// `jobs/run-<id>.log` (que também não existe lá) e girava pra sempre. Tela morta
// com cara de tela viva.
//
// Agora o POST grava uma linha em `run_queue` e o GET lê o estado dessa linha. O
// worker roda onde o Python existe (ciclo diário no GitHub Actions, ou na mão).
// Consequência que aparece na tela: o botão ficou ASSÍNCRONO — "enfileirado" não
// é "feito". Ver docs/OPERACAO.md, seção 9.
//
// Protegido pelo middleware (custa dinheiro). Allowlist estrita de tarefas.
export const dynamic = "force-dynamic";

type Opts = { max?: unknown; slug?: unknown; tema?: unknown };

// Sanitização dos parâmetros. NADA vem cru do cliente — e o que sai daqui é o
// que vai como `params` pro banco, porque o worker revalida tudo de novo do lado
// de lá (orchestrator/worker.py `build_args`). Validar só aqui seria confiar na
// web pra montar linha de comando no servidor de outra pessoa.
function sanitiza(opts: Opts) {
  const max = Math.min(Math.max(Number(opts.max) || 2, 1), 10);
  const bruto = typeof opts.slug === "string" ? opts.slug : "";
  // O `[a-z0-9]` inicial não estava aqui antes e é deliberado: `--dry-run` e
  // `--no-art` casam com `^[a-z0-9-]+$` e são flags DE VERDADE do
  // build_carousel/build_platforms. Sem shell não há injeção, mas parâmetro do
  // painel não pode virar opção do script.
  const slug = /^[a-z0-9][a-z0-9-]{0,79}$/.test(bruto) ? bruto : "";
  const tema = (typeof opts.tema === "string" ? opts.tema : "")
    .slice(0, 80)
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/^[\s-]+|[\s-]+$/g, ""); // mesma razão: valor não começa com hífen
  return { max, slug, tema };
}

// task → argumentos do `python -m ...`. Esta continua sendo A allowlist: o POST
// só enfileira o que passa por aqui. Os argumentos em si não vão pro banco (o
// worker os remonta) — o que importa é o veredito: `null` = pedido inválido.
function buildArgs(task: string, opts: Opts): string[] | null {
  const { max, slug, tema } = sanitiza(opts);
  switch (task) {
    case "fase_a": return ["-m", "orchestrator.phase_a", "--max", String(max)];
    case "fase_a_free": return ["-m", "orchestrator.phase_a", "--free", "--limit", "25"];
    case "carrossel": return slug ? ["-m", "orchestrator.build_carousel", slug] : null;
    case "plataformas": return slug ? ["-m", "orchestrator.build_platforms", slug] : null;
    case "atletas": return ["-m", "orchestrator.enrich_athlete", "--max", String(max)];
    case "produtos": return ["-m", "orchestrator.find_products", "--max", String(max)];
    case "produtos_dia": return ["-m", "orchestrator.find_products", "--diario"];
    case "curso": return tema ? ["-m", "orchestrator.build_course", "--tema", tema] : null;
    case "publicar": return ["-m", "orchestrator.sync_to_cloud"];  // republica o snapshot pro deploy
    case "tendencias": return ["-m", "orchestrator.scout_trends"];  // Trend Scout
    case "planejar": return ["-m", "orchestrator.plan_week"];       // Estrategista de Conteúdo
    case "ideias_3d": return ["-m", "orchestrator.ideate", "--kind", "3d"];       // Ideador 3D
    case "ideias_cursos": return ["-m", "orchestrator.ideate", "--kind", "cursos"]; // Ideador de cursos
    default: return null;
  }
}

/** Só o parâmetro que a tarefa realmente usa vai pro banco — o resto é ruído. */
function paramsDaTarefa(task: string, opts: Opts): Record<string, unknown> {
  const { max, slug, tema } = sanitiza(opts);
  if (["fase_a", "atletas", "produtos"].includes(task)) return { max };
  if (["carrossel", "plataformas"].includes(task)) return { slug };
  if (task === "curso") return { tema };
  return {};
}

type LinhaFila = {
  id: string; task: string; status: string;
  requested_at: string | null; started_at: string | null;
  finished_at: string | null; error: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Opts & { task?: unknown };
  const task = String(body.task || "");
  if (!buildArgs(task, body)) {
    return NextResponse.json({ error: "tarefa inválida ou faltam parâmetros" }, { status: 400 });
  }
  if (!dbEnabled()) {
    // Sem banco não há fila. Dizer isso na cara é melhor que aceitar o clique e
    // não fazer nada — que foi o defeito que esta mudança veio consertar.
    return NextResponse.json(
      { error: "fila indisponível: falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY neste ambiente" },
      { status: 503 },
    );
  }

  // O id é gerado AQUI, não pelo banco. Assim a resposta já sai com ele sem
  // precisar de `return=representation`, e uma repetição do mesmo pedido (retry
  // de rede) cai em cima da mesma linha em vez de enfileirar duas execuções.
  const id = crypto.randomUUID();
  const ok = await dbUpsert("run_queue", {
    id,
    task,
    params: paramsDaTarefa(task, body),
    status: "pendente",
    // O /admin tem senha única, não usuário — não há identidade a registrar
    // além de "veio do painel" (o cron grava outra coisa).
    requested_by: "painel",
  });
  if (!ok) return NextResponse.json({ error: "não consegui enfileirar (banco)" }, { status: 502 });

  // `runId` mantém o nome que o painel já usa; agora é o id da linha da fila.
  return NextResponse.json({ runId: id, id, status: "pendente" });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const linhas = await dbSelect<LinhaFila>(
    `run_queue?id=eq.${encodeURIComponent(id)}` +
    `&select=id,task,status,requested_at,started_at,finished_at,error`,
  );

  // null é ERRO de leitura, [] é "não achei" — tratar os dois igual faria o
  // painel declarar "pronto" numa instabilidade de rede (ver lib/server-db.ts).
  if (linhas === null) {
    return NextResponse.json({ log: "não consegui ler o estado da fila — tentando de novo…", done: false });
  }
  const linha = linhas[0];
  if (!linha) {
    // Some quando o pedido é de antes desta mudança (id de log antigo) ou a
    // linha foi apagada. `done` corta o polling em vez de girar pra sempre.
    return NextResponse.json({ log: "pedido não encontrado na fila.", done: true, status: "ausente" });
  }

  const done = linha.status === "concluido" || linha.status === "falhou";
  let log: string;
  if (linha.status === "pendente") {
    log =
      `na fila desde ${hora(linha.requested_at)} — aguardando o worker.\n\n` +
      `Quem executa é o ciclo diário (06:00) ou, na mão, ` +
      `\`python -m orchestrator.worker\`.\nPode fechar esta tela: o pedido não se perde.`;
  } else if (linha.status === "executando") {
    log = `executando desde ${hora(linha.started_at)}…\n\n` +
      `A saída completa fica no log do worker (jobs/run-*.log, ou o anexo do run no GitHub Actions).`;
  } else if (linha.status === "concluido") {
    log = `concluído em ${hora(linha.finished_at)}. ✔\n\nO resultado já está no painel.`;
  } else {
    log = `FALHOU em ${hora(linha.finished_at)}.\n\n${linha.error || "sem detalhe registrado"}`;
  }

  return NextResponse.json({ log, done, status: linha.status, task: linha.task });
}
