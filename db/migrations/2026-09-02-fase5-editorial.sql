-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 5 · CONTROLE EDITORIAL
-- Rode no SQL Editor do projeto bjj (hrgfbwkjjtiymmnediwq). Idempotente.
--
-- A fase 1 já criou destaque/ordem/arquivado e o índice da vitrine. Esta
-- migração fecha o que faltava para a coluna do banco poder VENCER o valor
-- lido do arquivo sem risco:
--
--   1. `categoria` deixa de aceitar qualquer texto. Enquanto ela era só
--      "sugestão do arquivo", um valor estranho não fazia mal — ninguém lia.
--      Agora ela manda no portal, e uma editoria desconhecida produz uma
--      seção que a home não renderiza e um rótulo vazio no card. O código TS
--      já ignora valor inválido (aplicaEstado cai na categoria do arquivo);
--      o CHECK é a segunda camada, pra quem editar direto no SQL Editor.
--
--   2. Índice pra tela de admin: ela lista por arquivado e por editoria, e
--      hoje o único índice útil é parcial em `status = 'published'` — ou
--      seja, não serve pra nenhuma das abas que mostram rascunho e arquivo.
--
-- Nada aqui apaga dado. A limpeza do passo 1 só zera categoria inválida, e
-- categoria nula significa "vale a sugestão do arquivo".
-- ═══════════════════════════════════════════════════════════════════════════

-- 0) Rede de segurança: se a fase 1 não rodou, as colunas nascem aqui ───────
alter table dossiers add column if not exists destaque  boolean default false;
alter table dossiers add column if not exists ordem     int;
alter table dossiers add column if not exists arquivado boolean default false;
update dossiers set arquivado = false where arquivado is null;
update dossiers set destaque  = false where destaque  is null;

-- 1) Categoria só pode ser uma das 4 editorias do portal ───────────────────
-- normaliza antes: caixa alta e espaço em volta vieram de import antigo
update dossiers
   set categoria = lower(btrim(categoria))
 where categoria is not null and categoria <> lower(btrim(categoria));

-- o que sobrar fora da lista vira null = "usa a sugestão do arquivo"
update dossiers
   set categoria = null
 where categoria is not null
   and categoria not in ('superlutas','noticias','analises','tecnica');

-- string vazia não é editoria; é ausência de editoria
update dossiers set categoria = null where categoria = '';

alter table dossiers drop constraint if exists dossiers_categoria_valida;
alter table dossiers add constraint dossiers_categoria_valida
  check (categoria is null or categoria in ('superlutas','noticias','analises','tecnica'));

-- 2) Título vazio também é ausência de correção ────────────────────────────
-- (o admin já grava null quando o operador limpa o campo; isto arruma o legado)
update dossiers set titulo = null where btrim(coalesce(titulo,'')) = '';

-- 3) Índice das abas do admin ──────────────────────────────────────────────
-- A tela filtra por arquivado (aba) + categoria (filtro) e ordena por data.
-- O idx_dossiers_vitrine da fase 1 é parcial em published, então não cobre
-- as abas "Rascunho" e "Arquivados", que são justamente as mais longas.
create index if not exists idx_dossiers_admin
  on dossiers (arquivado, categoria, data desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência:
--   -- 0 linhas: nenhuma editoria fora das 4
--   select categoria, count(*) from dossiers group by 1 order by 2 desc;
--
--   -- a constraint existe
--   select conname from pg_constraint
--    where conrelid = 'dossiers'::regclass and conname = 'dossiers_categoria_valida';
--
--   -- deve RECUSAR (é o ponto da migração):
--   -- update dossiers set categoria = 'esportes' where slug = (select slug from dossiers limit 1);
--
--   -- panorama do controle editorial
--   select status, arquivado, destaque, count(*) from dossiers group by 1,2,3 order by 4 desc;
-- ═══════════════════════════════════════════════════════════════════════════
