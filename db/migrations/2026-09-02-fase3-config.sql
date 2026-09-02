-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 3 · CONFIGURAÇÃO NO BANCO
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- POR QUE: tudo que o painel edita hoje — os 23 prompts, catálogo, fontes,
-- voz, regras, atletas, cursos — é gravado com fs.writeFileSync em
-- `process.cwd()/..`. Esse caminho não existe na Vercel. A edição falha em
-- silêncio ou estoura sem explicar, e some no próximo deploy.
--
-- A REGRA: o BANCO manda, o arquivo no git é SEMENTE. Para fazer o arquivo
-- valer de novo, roda-se `python -m orchestrator.seed_config` de propósito —
-- nunca automático. A alternativa ("o mais novo ganha") depende de relógio e
-- produz sobrescrita fantasma no dia em que se edita nos dois lugares.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Conteúdo de arquivo (prompts, YAML, markdown) ──────────────────────────
create table if not exists app_config (
  path         text primary key,        -- 'config/fontes.yaml', 'agents/radar/system.md'
  conteudo     text not null,
  content_hash text,                    -- sha256 do que veio do arquivo na semeadura
  updated_at   timestamptz default now(),
  updated_by   text
);

drop trigger if exists trg_app_config_updated on app_config;
create trigger trg_app_config_updated before update on app_config
  for each row execute function set_updated_at();

-- 2) Ajustes escalares (o que hoje mora no .env e é de negócio) ─────────────
create table if not exists app_settings (
  key        text primary key,          -- SCOUT_MODEL, SPEND_CAP_USD, AMAZON_PARTNER_TAG
  valor      text,
  segredo    boolean default false,     -- true = a tela NUNCA devolve o valor
  updated_at timestamptz default now(),
  updated_by text
);

drop trigger if exists trg_app_settings_updated on app_settings;
create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();

-- 3) RLS: nenhuma policy para anon ─────────────────────────────────────────
--    Estas duas tabelas guardam prompt de agente, link de afiliado e ajuste de
--    gasto. A chave anônima vai no bundle do navegador; ninguém lê por ela.
--    O pipeline e as Server Actions usam service role, que ignora RLS.
alter table app_config   enable row level security;
alter table app_settings enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência:
--   select count(*) from app_config;    -- 0 antes do primeiro seed
--   select count(*) from app_settings;  -- 0 antes do primeiro seed
--
--   -- depois de `python -m orchestrator.seed_config --all`, esperado ~31:
--   -- 23 prompts + catalogo + fontes + atletas + voz + regras + bjj-visual + cursos
--   select path from app_config order by path;
-- ═══════════════════════════════════════════════════════════════════════════
