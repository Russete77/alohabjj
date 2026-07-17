-- ============================================================================
-- BjjcomLucas / AlohaBJJ — Schema Postgres (Supabase)
-- Arquivos continuam sendo o artefato; o banco é o índice consultável +
-- estado operacional (workflow) + memória dos agentes e da conversão.
-- Rode no SQL Editor do Supabase (ou psql). Idempotente onde dá.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- busca fuzzy (título/atleta)
create extension if not exists vector;      -- pgvector (dedup semântico)

-- ───────────────────────── ENUMS (vocabulário controlado) ──────────────────
do $$ begin
  create type confianca_enum   as enum ('alta','media','baixa');
  create type dossier_status   as enum ('raw','researched','validated','published');
  create type piece_status      as enum ('gerado','aprovado','rejeitado','agendado','publicado');
  create type platform_enum     as enum ('instagram_feed','instagram_reels','story','tiktok','youtube_shorts');
  create type pkg_status         as enum ('draft','approved','scheduled','published');
  create type produto_tipo       as enum ('proprio','afiliado');
  create type source_category    as enum ('news','analysis','technique','events','org','own');
  create type agent_step_enum    as enum ('radar','pesquisador','validador','analista','supervisor',
                                          'carrossel','avaliador','diretor_arte','art_qc','capa_visao',
                                          'instagram','tiktok','youtube','imagegen','afiliados');
  create type run_status         as enum ('running','succeeded','errored');
  create type event_type         as enum ('impression','click','conversion');
exception when duplicate_object then null; end $$;

-- ───────────────────────── DIMENSÕES ───────────────────────────────────────
create table if not exists athletes (
  id            uuid primary key default gen_random_uuid(),
  nome_canonico text not null,                 -- grafia BJJ-Heroes
  slug          text unique not null,
  aliases       text[] default '{}',
  created_at    timestamptz default now()
);
create index if not exists idx_athletes_nome_trgm on athletes using gin (nome_canonico gin_trgm_ops);

create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text,
  rss_url     text,
  type        text default 'web',              -- web | youtube
  lang        text default 'en',
  category    source_category default 'news',
  priority    smallint default 2,
  channel_id  text, youtube_handle text,
  active      boolean default true,
  notes       text
);

create table if not exists source_candidates (   -- descoberta semanal (gate humano)
  id uuid primary key default gen_random_uuid(),
  name text, url text, motivo text,
  status text default 'proposed',                -- proposed | approved | rejected
  created_at timestamptz default now()
);

create table if not exists products (
  id            text primary key,                -- curso | bjj3d | rashguard-nogi ...
  nome          text not null,
  tipo          produto_tipo not null,
  prioridade    smallint default 3,
  tags          text[] default '{}',
  gatilho       text, busca text,
  url_base      text, cupom text, desconto text,
  margem        numeric,
  disclosure_obrigatorio boolean default false,
  cta_sugerido  text, gancho text
);

-- ───────────────────────── DOSSIÊS (Fase A) ────────────────────────────────
create table if not exists dossiers (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  titulo        text,
  categoria     text,                            -- superlutas|noticias|analises|tecnica
  evento        text,
  data          date,
  confianca     confianca_enum default 'media',
  status        dossier_status default 'validated',
  source_url    text, source text, lang text default 'pt-BR',
  resumo        text, featured_image text,
  embedding     vector(1024),                    -- dedup semântico (modelo em `topics`)
  artifact_path text,                            -- knowledge/<slug>/
  content_hash  text,                            -- detecta drift arquivo↔banco
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_dossiers_cat_data on dossiers (categoria, data desc);
create index if not exists idx_dossiers_titulo_trgm on dossiers using gin (titulo gin_trgm_ops);
create index if not exists idx_dossiers_embedding on dossiers using hnsw (embedding vector_cosine_ops);

create table if not exists dossier_facts (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  texto text not null, fonte text,
  status text default 'fato_confirmado'          -- fato_confirmado | nao_confirmado
);
create index if not exists idx_facts_dossier on dossier_facts (dossier_id);

create table if not exists dossier_angles (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  angulo text not null, conversao boolean default false,
  used boolean default false                     -- substitui angulos_usados[]; fecha angle→piece
);
create index if not exists idx_angles_dossier on dossier_angles (dossier_id);

create table if not exists dossier_athletes (
  dossier_id uuid references dossiers(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,
  primary key (dossier_id, athlete_id)
);
create index if not exists idx_dossier_athletes_ath on dossier_athletes (athlete_id);

create table if not exists dossier_tags (
  dossier_id uuid references dossiers(id) on delete cascade,
  tag text, primary key (dossier_id, tag)
);

-- ───────────────────────── PEÇAS (Fase B) ──────────────────────────────────
create table if not exists pieces (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid references dossiers(id) on delete set null,  -- 1 dossiê → N peças
  slug          text unique,
  formato       text,                            -- integrado | separado | carrossel ...
  produto_id    text references products(id),
  angle_id      uuid references dossier_angles(id),               -- ângulo usado (conversão)
  relevancia_motivo text,
  cta           text, caption text, hashtags text[],
  tracked_url   text, link_afiliado text, produto_titulo text, precisa_link boolean default false,
  disclosure    text, is_ai_generated boolean default true,
  quality_nota  int, quality_aprovado boolean,
  estado        piece_status default 'gerado',
  slides        jsonb,                            -- slides.json (lido em bloco)
  artifact_path text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_pieces_estado on pieces (estado, created_at desc);
create index if not exists idx_pieces_produto on pieces (produto_id);
create index if not exists idx_pieces_dossier on pieces (dossier_id);

create table if not exists piece_state_transitions (   -- auditoria do workflow (sem last-write-wins)
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces(id) on delete cascade,
  from_state piece_status, to_state piece_status not null,
  actor text,                                    -- 'agent' | e-mail do humano
  reason text, created_at timestamptz default now()
);
create index if not exists idx_transitions_piece on piece_state_transitions (piece_id, created_at);

create table if not exists platform_packages (       -- 1 por peça × canal
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces(id) on delete cascade,
  channel platform_enum not null,
  payload jsonb not null,                        -- shape por canal (caption/hook/roteiro/titulo)
  status pkg_status default 'draft',
  scheduled_at timestamptz, published_at timestamptz,
  external_post_id text, external_url text,
  unique (piece_id, channel)
);
create index if not exists idx_pkg_queue on platform_packages (status, scheduled_at);

create table if not exists art_assets (              -- metadados dos PNGs (binário fica em storage/disco)
  id uuid primary key default gen_random_uuid(),
  piece_id uuid references pieces(id) on delete cascade,
  kind text,                                     -- story | slide | hero | cover
  path text, source text,                        -- ia | frame | referencia
  mime text, bytes int, width int, height int,
  created_at timestamptz default now()
);
create index if not exists idx_art_piece on art_assets (piece_id);

-- ───────────────────────── AGENTES (a memória que os acompanha) ─────────────
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text unique not null,                   -- fase-a-YYYYmmdd-HHMMSS
  phase text, kind text,                         -- A|B ; fase-a|carrossel|plataformas|backfill
  started_at timestamptz, finished_at timestamptz,
  total_cost_est numeric default 0, status run_status default 'running',
  dossier_id uuid references dossiers(id) on delete set null,
  piece_id uuid references pieces(id) on delete set null
);

create table if not exists agent_steps (             -- 1 linha por passo de agente (append-heavy)
  id bigint generated always as identity primary key,
  run_id text references agent_runs(run_id) on delete cascade,
  step text not null, status run_status not null,   -- text (não enum): os passos evoluem
  key text,                                       -- slug ou 'lote'
  custom_id text, model text, prompt_version text,
  in_tok int default 0, out_tok int default 0, cost_est numeric default 0,
  t0 double precision, t1 double precision,
  latency_ms int generated always as (round((t1 - t0) * 1000)) stored,
  error text,
  dossier_id uuid references dossiers(id) on delete set null,
  piece_id uuid references pieces(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_steps_resume  on agent_steps (step, key, status);  -- resume O(1) / idempotência
create index if not exists idx_steps_model    on agent_steps (model, created_at);
create index if not exists idx_steps_dossier  on agent_steps (dossier_id);
create index if not exists idx_steps_piece    on agent_steps (piece_id);

-- ───────────────────────── TRACKING / CONVERSÃO (o loop que faltava) ────────
create table if not exists events (
  id bigint generated always as identity primary key,
  event_type event_type not null, occurred_at timestamptz default now(),
  piece_id uuid references pieces(id) on delete set null,
  platform_package_id uuid references platform_packages(id) on delete set null,
  product_id text references products(id),
  dossier_id uuid references dossiers(id) on delete set null,   -- denormalizado (group-by rápido)
  tracked_url text, utm_source text, utm_content text, utm_medium text, utm_campaign text,
  referrer text, ip_hash text, user_agent text, session_id text,
  value numeric, meta jsonb
);
create index if not exists idx_events_piece on events (piece_id, event_type, occurred_at);
create index if not exists idx_events_utm on events (utm_content);

-- MV que o Supervisor lê pra aprender produto×ângulo×formato que converte
create materialized view if not exists mv_conversion_by_angle_format as
select p.produto_id, p.formato, a.angulo,
       count(*) filter (where e.event_type='impression') as impressions,
       count(*) filter (where e.event_type='click')      as clicks,
       count(*) filter (where e.event_type='conversion')  as conversions
from events e
join pieces p on p.id = e.piece_id
left join dossier_angles a on a.id = p.angle_id
group by p.produto_id, p.formato, a.angulo;

-- ───────────────────────── DEDUP SEMÂNTICO / SEEN-LOG ───────────────────────
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references dossiers(id) on delete cascade,
  title text, embedding vector(1024), model text default 'voyage-3',
  created_at timestamptz default now()
);
create index if not exists idx_topics_embedding on topics using hnsw (embedding vector_cosine_ops);

create table if not exists ingested_urls (          -- substitui .seen_urls.json (com auditoria)
  url text primary key,
  source_id uuid references sources(id) on delete set null,
  dossier_id uuid references dossiers(id) on delete set null,
  first_seen_at timestamptz default now(),
  decision text, sim_score numeric, method text     -- novo|enriquecer|cortado ; slug|embedding|lexical
);

-- ───────────────────────── RLS (3 papéis) ──────────────────────────────────
-- service_role (pipeline Python, server-side) IGNORA RLS por padrão no Supabase.
-- anon (portal público) lê só publicado. authenticated (staff do /admin) gerencia.
alter table dossiers          enable row level security;
alter table pieces            enable row level security;
alter table platform_packages enable row level security;

drop policy if exists "public read dossiers publicados" on dossiers;
create policy "public read dossiers publicados" on dossiers
  for select to anon using (status = 'published');

drop policy if exists "public read pieces publicadas" on pieces;
create policy "public read pieces publicadas" on pieces
  for select to anon using (estado = 'publicado');

drop policy if exists "public read packages publicados" on platform_packages;
create policy "public read packages publicados" on platform_packages
  for select to anon using (status = 'published');

drop policy if exists "staff gerencia dossiers" on dossiers;
create policy "staff gerencia dossiers" on dossiers for all to authenticated using (true) with check (true);
drop policy if exists "staff gerencia pieces" on pieces;
create policy "staff gerencia pieces" on pieces for all to authenticated using (true) with check (true);
drop policy if exists "staff gerencia packages" on platform_packages;
create policy "staff gerencia packages" on platform_packages for all to authenticated using (true) with check (true);

-- ============================================================================
-- Notas de produção:
-- • agent_steps e events são as duas "mangueiras" — quando crescerem, particionar
--   por mês (range em created_at/occurred_at) e refresh da MV via pg_cron.
-- • Binários (story.png ~2MB) vão pro Supabase Storage; art_assets guarda só o path.
-- • Importador idempotente (por slug) lê knowledge/ + outputs/ + jobs/ e popula tudo.
-- • Chaves no .env: SUPABASE_SERVICE_ROLE_KEY (só server/Python) e
--   NEXT_PUBLIC_SUPABASE_ANON_KEY (cliente). NUNCA prefixar a service-role com NEXT_PUBLIC_.
-- ============================================================================
