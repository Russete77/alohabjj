-- ═══════════════════════════════════════════════════════════════════════════
-- LÁPIDES — apagar no painel precisa GRUDAR
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- O DEFEITO: o índice de dossiês é reconstruído a partir do DISCO
-- (orchestrator/import_index.py, chamado no fluxo do ciclo diário). Apagar pelo
-- painel remove a linha do banco — e, quando há disco, também os arquivos. Mas
-- na Vercel NÃO há disco: a ação remove só o registro e avisa que os arquivos
-- ficaram. Aí o próximo import vê o arquivo lá e RESSUSCITA o dossiê.
--
-- Aconteceu de verdade: um dossiê apagado pelo painel voltou no import seguinte.
--
-- A correção não é apagar o arquivo (ele é o artefato, e é o que permite
-- reprocessar). É lembrar que aquele slug foi apagado DE PROPÓSITO — e o
-- importador respeitar essa decisão.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists dossiers_apagados (
  slug        text primary key,
  titulo      text,                       -- pra tela mostrar o que foi, não só o slug
  apagado_em  timestamptz default now(),
  apagado_por text,
  motivo      text
);

alter table dossiers_apagados enable row level security;
-- Sem policy pra anon: é registro operacional, ninguém lê pelo navegador.

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência:
--   select slug, titulo, apagado_em from dossiers_apagados order by apagado_em desc;
--
--   -- nenhum apagado pode estar de volta no índice (deve devolver 0 linhas):
--   select d.slug from dossiers d join dossiers_apagados a on a.slug = d.slug;
-- ═══════════════════════════════════════════════════════════════════════════
