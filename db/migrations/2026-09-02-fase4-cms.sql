-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4 · CMS DE CONTEÚDO
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- A fase 5 deu ao operador título, editoria, destaque, ordem e arquivo. Faltava
-- o CORPO: hoje o texto do dossiê é o que o Analista escreveu, e ponto. Se ele
-- erra um nome ou exagera numa frase, a única saída é regerar o dossiê inteiro
-- por ~US$ 0,47.
--
-- O princípio da casa continua: o ARQUIVO é o artefato (o que a IA produziu,
-- preservado), o BANCO é o estado. A edição do operador é estado — mora aqui e
-- vence na hora de renderizar, sem apagar o original.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Corpo e capa editados ──────────────────────────────────────────────────
-- NULL = "não editado, usa o que veio do arquivo". Não é o mesmo que string
-- vazia, que significaria "o operador apagou o texto de propósito".
alter table dossiers add column if not exists resumo_editado text;
alter table dossiers add column if not exists imagem_editada text;

comment on column dossiers.resumo_editado is
  'Corpo corrigido pelo operador. NULL = usa o summary.md do arquivo.';
comment on column dossiers.imagem_editada is
  'Capa trocada pelo operador. NULL = usa a imagem do dossiê/backfill.';

-- 2) Tags editáveis ────────────────────────────────────────────────────────
-- A tabela dossier_tags já existe no schema.sql e nunca foi usada. Ela é a
-- outra ponta do casamento pauta x produto: o Supervisor cruza as tags do
-- dossiê (que o Analista inventa) com as do catálogo. Sem poder editar este
-- lado, tag errada = produto errado grudado, e a única saída era regerar.
--
-- Índice pro vocabulário: a tela oferece as tags já usadas, pra não virar
-- texto livre com "no-gi", "nogi" e "No-Gi" convivendo.
create index if not exists idx_dossier_tags_tag on dossier_tags (tag);

-- dossier_tags herda RLS? Não — foi criada antes e a fase 2 ligou. Reafirma.
alter table dossier_tags enable row level security;

-- 3) Quem editou o quê ─────────────────────────────────────────────────────
-- Sem isto, "o texto mudou" não tem autor nem data, e num painel de uma pessoa
-- só isso ainda importa: distingue correção humana de regeração do pipeline.
alter table dossiers add column if not exists editado_em  timestamptz;
alter table dossiers add column if not exists editado_por text;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência:
--   select count(*) filter (where resumo_editado is not null) as corpos_editados,
--          count(*) filter (where imagem_editada is not null) as capas_trocadas,
--          count(*) as total
--     from dossiers;
--
--   -- vocabulário de tags em uso (alimenta o seletor da tela):
--   select tag, count(*) from dossier_tags group by tag order by 2 desc limit 20;
-- ═══════════════════════════════════════════════════════════════════════════
