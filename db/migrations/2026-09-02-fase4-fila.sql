-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4 · FILA DE EXECUÇÃO (os botões "Rodar" do painel deixam de ser enfeite)
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente:
-- pode rodar de novo sem quebrar nada.
--
-- POR QUE: /api/run fazia `spawn("python", args)` — disparava o pipeline DENTRO
-- do processo que serve o painel. Isso só funciona na máquina do dono. Na Vercel
-- não existe python, não existe o repositório e não existe disco: o botão
-- respondia com um runId, o console ao vivo tentava ler `jobs/run-<id>.log` (que
-- também não existe lá) e ficava girando pra sempre. Tela morta com aparência de
-- tela viva — o pior tipo.
--
-- A MUDANÇA: o painel deixa de EXECUTAR e passa a PEDIR. O POST grava uma linha
-- aqui; quem executa é o `orchestrator/worker.py`, rodando onde o Python existe
-- (o ciclo diário do GitHub Actions, ou a máquina do dono na mão). O painel lê o
-- estado desta tabela para mostrar o que aconteceu.
--
-- Consequência que o dono precisa saber (está em docs/OPERACAO.md): o botão
-- passou a ser assíncrono. "Enfileirado" não é "feito" — se ninguém roda o
-- worker, a fila cresce e nada acontece.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) A fila ──────────────────────────────────────────────────────────────────
--    `params` é jsonb porque cada tarefa quer um parâmetro diferente (max, slug,
--    tema) e não vale a pena uma coluna por parâmetro. O que entra aqui já vem
--    SANITIZADO pela rota, e é revalidado no Python antes de virar linha de
--    comando — nada do cliente chega ao shell.
create table if not exists run_queue (
  id           uuid primary key default gen_random_uuid(),
  task         text not null,                  -- 'fase_a', 'carrossel', ... (allowlist)
  params       jsonb default '{}'::jsonb,      -- {"max":2} | {"slug":"..."} | {"tema":"..."}
  status       text default 'pendente',        -- pendente|executando|concluido|falhou
  run_id       text,                           -- carimbo do worker que pegou (bate com jobs/run-*.log)
  requested_by text,                           -- quem clicou (e-mail do admin), quando dá pra saber
  requested_at timestamptz default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text                            -- por que falhou, em texto (o painel mostra)
);

-- 2) Índice da varredura do worker ───────────────────────────────────────────
--    A pergunta que o worker faz a cada ciclo é sempre a mesma: "qual é a
--    `pendente` mais antiga?". Sem este índice isso vira seq scan na tabela
--    inteira assim que o histórico crescer.
create index if not exists idx_run_queue_pend on run_queue (status, requested_at);

-- 3) RLS: nenhuma policy para anon ───────────────────────────────────────────
--    Enfileirar aqui DISPARA GASTO DE API. A chave anônima vai no bundle do
--    navegador — qualquer um que abrisse o site poderia enfileirar mil Fase A e
--    torrar a conta da Anthropic. Com RLS ligada e ZERO policy, o anon não lê
--    nem escreve. A rota do painel e o worker usam a service role, que ignora
--    RLS (e a rota já está atrás do middleware de admin).
--
--    Repare que não há `create policy` nenhum abaixo. Isso é deliberado, não
--    esquecimento: tabela nova aqui costuma nascer com `using (true)` por
--    hábito, e neste caso `using (true)` seria uma torneira de dinheiro aberta.
alter table run_queue enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência:
--   -- a tabela existe e está vazia:
--   select count(*) from run_queue;
--
--   -- RLS ligada e sem policy (esperado: rowsecurity = true, 0 policies):
--   select relrowsecurity from pg_class where relname = 'run_queue';
--   select count(*) from pg_policies where tablename = 'run_queue';
--
--   -- o que está na fila agora (fila cheia de 'pendente' = worker não roda):
--   select status, count(*) from run_queue group by status;
--   select task, status, requested_at, error from run_queue
--    order by requested_at desc limit 20;
-- ═══════════════════════════════════════════════════════════════════════════
