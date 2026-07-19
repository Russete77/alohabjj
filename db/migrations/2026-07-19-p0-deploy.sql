-- ═══════════════════════════════════════════════════════════════════════════
-- P0 · DEPLOY-READINESS
-- Rode ISTO no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq).
-- É idempotente: pode rodar de novo sem quebrar nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) SOLTA A FK QUE TRAVA A GRAVAÇÃO DE PEÇAS ────────────────────────────────
--    O erro era: produto_id=gi-competicao "is not present in table products".
--    produto_id é a CATEGORIA do catálogo/ManyChat (ex.: gi-competicao), não um
--    id da loja. Vira texto solto — o db.py para de falhar em silêncio.
alter table pieces drop constraint if exists pieces_produto_id_fkey;

-- 2) RLS — o ADMIN lê server-side com a SERVICE ROLE (que bypassa RLS, sem policy).
--    O PÚBLICO (anon, portal/loja) só enxerga o que é público.
alter table dossiers enable row level security;
alter table pieces   enable row level security;
alter table products enable row level security;

drop policy if exists pub_read_dossiers on dossiers;
create policy pub_read_dossiers on dossiers
  for select to anon using (status in ('validated','published'));

drop policy if exists pub_read_pieces on pieces;
create policy pub_read_pieces on pieces
  for select to anon using (estado = 'publicado');

drop policy if exists pub_read_products on products;
create policy pub_read_products on products
  for select to anon using (status = 'active');

-- ═══════════════════════════════════════════════════════════════════════════
-- Confirmação rápida (deve rodar sem erro e a FK não deve mais existir):
--   select conname from pg_constraint where conname = 'pieces_produto_id_fkey';  -- 0 linhas
-- ═══════════════════════════════════════════════════════════════════════════
