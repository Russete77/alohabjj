-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 · O PORTEIRO
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- A migração de 19/07 afrouxou a leitura pública para ('validated','published')
-- pra o deploy mostrar conteúdo. Como o pipeline grava tudo como 'validated',
-- isso tornou público 9 dossiês que a própria apuração reprovou. Aqui a trava
-- volta ao desenho original: só o que um humano promoveu vai ao ar.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Colunas de controle editorial ──────────────────────────────────────────
alter table dossiers add column if not exists destaque  boolean default false;
alter table dossiers add column if not exists ordem     int;
alter table dossiers add column if not exists arquivado boolean default false;

-- linhas antigas não podem ficar com null (o filtro arquivado=is.false perderia elas)
update dossiers set arquivado = false where arquivado is null;
update dossiers set destaque  = false where destaque  is null;

-- home: destaque primeiro, depois ordem manual, depois data
create index if not exists idx_dossiers_vitrine
  on dossiers (destaque desc, ordem asc nulls last, data desc)
  where status = 'published' and arquivado = false;

-- 2) A trava volta ──────────────────────────────────────────────────────────
drop policy if exists pub_read_dossiers on dossiers;
drop policy if exists "public read dossiers publicados" on dossiers;
create policy pub_read_dossiers on dossiers
  for select to anon
  using (status = 'published' and arquivado = false);

-- pieces e platform_packages NAO precisam de mudanca: as policies de anon ja
-- exigem estado='publicado' / status='published'. Foi so a de dossiers que a
-- migracao de julho afrouxou. Conferido, nao esquecido.

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência (deve devolver 0 nas duas primeiras e a policy na terceira):
--   select count(*) from dossiers where status = 'published';        -- 0 hoje
--   select count(*) from dossiers where arquivado is null;           -- 0
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--     where polrelid = 'dossiers'::regclass and polname = 'pub_read_dossiers';
-- ═══════════════════════════════════════════════════════════════════════════
