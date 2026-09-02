-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 · SEGURANÇA
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- No Supabase, tabela do schema public SEM RLS e legivel pela chave anonima —
-- que vai no bundle do navegador. O schema.sql ligou RLS em 7 tabelas; estas
-- 14 ficaram de fora. Nenhuma delas precisa de leitura publica: o pipeline usa
-- service role, que ignora RLS.
-- ═══════════════════════════════════════════════════════════════════════════

alter table agent_runs              enable row level security;
alter table agent_steps             enable row level security;
alter table events                  enable row level security;
alter table athletes                enable row level security;
alter table sources                 enable row level security;
alter table source_candidates       enable row level security;
alter table topics                  enable row level security;
alter table ingested_urls           enable row level security;
alter table dossier_facts           enable row level security;
alter table dossier_angles          enable row level security;
alter table dossier_athletes        enable row level security;
alter table dossier_tags            enable row level security;
alter table art_assets              enable row level security;
alter table piece_state_transitions enable row level security;

-- Sem policy = ninguem le pelo anon. O service role continua passando por cima.

-- Tentativas de login (contador em memoria nao serve: cada instancia
-- serverless teria o seu proprio, e o atacante so precisa cair em outra).
create table if not exists login_attempts (
  ip_hash    text primary key,
  tentativas int  not null default 0,
  janela_ate timestamptz not null default now() + interval '15 minutes'
);
alter table login_attempts enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferencia — deve devolver ZERO linhas:
--   select t.tablename from pg_tables t
--     join pg_class c on c.relname = t.tablename
--    where t.schemaname = 'public' and not c.relrowsecurity;
-- ═══════════════════════════════════════════════════════════════════════════
