-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4 · TRACKING NO BANCO (o loop de aprendizado deixa de morrer no deploy)
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente:
-- pode rodar de novo sem quebrar nada.
--
-- POR QUE: as rotas /r, /k e /p gravavam o clique com appendFileSync em
-- tracking/events.jsonl. Na Vercel o disco e efemero — o evento era gravado e
-- sumia no fim da invocacao. O painel /admin/conversao lia o mesmo arquivo (por
-- isso mostrava zero pra sempre) e o Supervisor de Vendas aprendia do mesmo
-- arquivo (por isso nunca aprendia nada). A partir desta fase o destino do
-- clique e a tabela `events`.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) SOLTA A FK QUE ENGOLIRIA TODA GRAVACAO DE EVENTO ────────────────────────
--    events.product_id aponta pra products(id), e products esta VAZIA. Como o
--    PostgREST devolve 409/23503 e a gravacao e best-effort (nunca pode quebrar
--    o redirect), o erro seria descartado em silencio: o clique some, o painel
--    segue em zero e ninguem descobre.
--
--    E o mesmo defeito de julho: pieces.produto_id tinha FK equivalente e
--    engoliu gravacao por DIAS ate a migracao db/migrations/2026-07-19-p0-deploy.sql
--    derrubar a constraint (ver secao 1 daquele arquivo, erro identico
--    "produto_id=gi-competicao is not present in table products").
--
--    A razao de fundo e a mesma: product_id aqui e a CATEGORIA do catalogo
--    (config/catalogo.yaml — ex.: gi-competicao, rashguard-nogi), nao um id de
--    linha da loja. Sao dois vocabularios diferentes que nunca deviam ter sido
--    amarrados por FK. Vira texto solto.
alter table events drop constraint if exists events_product_id_fkey;

-- 2) INDICES DE LEITURA DO PAINEL ────────────────────────────────────────────
--    O painel agrega por peca. A peca vive em meta->>'piece' (texto: slug do
--    dossie, "k:GI", "loja:bjj3d") porque a coluna piece_id e UUID com FK pra
--    pieces e /k e /p nem sequer se referem a uma peca. Indice de expressao
--    pra esse group-by nao virar seq scan quando a tabela crescer.
create index if not exists idx_events_meta_piece on events ((meta->>'piece'));

--    O painel e a memoria do Supervisor leem sempre "os mais recentes primeiro".
create index if not exists idx_events_occurred on events (occurred_at desc);

-- 3) RLS ─────────────────────────────────────────────────────────────────────
--    Reafirma o que a fase 2 ja fez: events com RLS ligada e SEM policy.
--    Ninguem le pelo anon (a chave anon vai no bundle do navegador); as rotas
--    e o painel gravam/leem com a service role, que passa por cima da RLS.
alter table events enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERENCIA (rode depois; o resultado esperado esta em cada linha)
--
-- a) a FK nao existe mais — deve devolver 0 linhas:
--    select conname from pg_constraint where conname = 'events_product_id_fkey';
--
-- b) a gravacao que antes falhava agora passa — deve inserir 1 linha:
--    insert into events (event_type, product_id, source, meta)
--    values ('click', 'gi-competicao', 'diagnostico', '{"piece":"teste"}'::jsonb);
--
-- c) limpe o teste da alinea (b):
--    delete from events where source = 'diagnostico';
-- ═══════════════════════════════════════════════════════════════════════════
