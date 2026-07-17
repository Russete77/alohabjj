# Banco de dados — AlohaBJJ (Supabase / Postgres)

Ordem de execução no SQL Editor do Supabase:
1. `schema.sql`        — extensões, enums, tabelas, índices, RLS, MV de conversão.
2. `seed_products.sql` — popula `products` a partir do catálogo.

Depois: um importador (a fazer) lê `knowledge/`, `outputs/` e `jobs/*.jsonl` e
popula dossiers/pieces/agent_steps de forma idempotente (por slug). O pipeline
Python passa a fazer dual-write (arquivo + banco) nos pontos que já escrevem.

Chaves no `.env` (não versionado):
- SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  → pipeline Python (server-side).
- NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY → portal (sob RLS).
