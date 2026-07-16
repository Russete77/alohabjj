# Auditoria de CTO — BjjcomLucas / AlohaBJJ

> Estado em 2026-07-16. Auditoria completa em 4 frentes (design, backend/pipeline, dados/banco, segurança/produção) antes de: repaginar o design → desenhar o banco → hardening de produção. Prioridades **P0** (bloqueia produção), **P1** (importante), **P2** (hardening/custo).

## Resumo executivo
O pipeline **funciona ponta a ponta** e a engenharia é sólida (roteamento de modelo, backoff, seen-log correto, portão de visão, guardrails). O que falta é **maturidade de produção**: o teto de gasto não é global, o custo de imagem é invisível, faltam banco/tracking (o Supervisor não consegue aprender), o `/admin` não tem autenticação, e — o mais sério — **a arte reposta foto de terceiros (risco de direito autoral)**, contrariando a nossa própria `regras.md §1`. O design tem bons ossos mas alguns "tells" de protótipo/IA. Nada disso é retrabalho grande; é fechar as pontas na ordem certa.

---

## 🔴 P0 — Crítico (resolver antes de deploy/escala)

| # | Frente | Achado | Evidência | Correção |
|---|---|---|---|---|
| P0-1 | Segurança/Legal | **Repostar foto de imprensa = violação de direito autoral.** Atribuição ("Foto: flgrappling") não é licença; com CTA pra curso pago/afiliado, cai a defesa de fair-use. Contraria a nossa `regras.md §1`. | `lib/heroimg.py`, `render_card.mjs:36`, fontes FloGrappling/IBJJF | Inverter: **arte própria/IA/licenciada como caminho feliz**; nunca repostar foto scrapeada. Allowlist de domínios licenciados. |
| P0-2 | Segurança | **`/admin` publica sem autenticação.** `layout.tsx` só põe `noindex`; `actions.ts publicar()` não checa auth. Ao subir na Vercel, o portão de aprovação fica aberto na internet. | `web/app/(admin)/admin/layout.tsx`, `actions.ts` | Auth real (middleware + Supabase Auth) antes de qualquer deploy. |
| P0-3 | Backend/Custo | **Teto de gasto é por-run, não global.** Cron/loop de falha gasta `SPEND_CAP` a cada invocação, sem teto diário. E **custo de imagem não entra no teto** (invisível). | `lib/claude.py`, `lib/jobs.py total_cost()`, `lib/imagegen.py` (sem `cost_est`) | Teto diário (`DAILY_SPEND_CAP_USD`) somando janela 24h + logar `cost_est` da imagem. |

---

## 🟡 P1 — Importante

| # | Frente | Achado | Correção |
|---|---|---|---|
| P1-1 | Backend | **Sem resume mid-chain:** Analista falha → re-cobra os ~$0.60 do Pesquisador+Validador. | Persistir `_research.json` por slug; pular etapa já `succeeded`. |
| P1-2 | Backend/Seg | **`web_search` sem `allowed_domains`** — viola a §5 (allowlist documentada, não imposta). Também é vetor de SSRF. | Passar domínios do `fontes.yaml` no bloco do web_search. |
| P1-3 | Backend | **Bug: `_sources` lê `source` em vez de `source_url`** — a foto real vinha "por sorte" via `facts.md`. | Trocar pra `m.get("source_url")` (1 palavra). |
| P1-4 | Compliance | **Disclosure CONAR só tem juiz-LLM (Haiku).** Pro afiliado Hayabusa, disclosure faltando = violação regulatória. | Checagem **determinística**: se `disclosure_obrigatorio`, falhar build sem `#publi` na 1ª linha. |
| P1-5 | Produção | **Sem alerta em run desatendido.** Falha às 6h vai pro log e ninguém sabe. | Hook Stop → e-mail/webhook em `errored`/`refused`/exit≠0. |
| P1-6 | Backend | **Dedupe "enriquecer" não implementado** — pauta de follow-up é descartada. | Implementar o append no dossiê existente. |
| P1-7 | Backend | **`build_dossiers` aborta tudo em erro 400** (só captura 3 exceções). | Capturar `anthropic.APIError`/`SpendCapExceeded`, pular slug. |
| P1-8 | Produção | **Sem backup.** `knowledge/`/`outputs/`/`.seen_urls.json` num Windows só. Perder o seen-log = reprocessa e re-cobra tudo. | Backup de `knowledge/`+`outputs/`; escrita atômica do seen-log. |

---

## 🟢 P2 — Hardening / custo

| # | Frente | Achado | Correção |
|---|---|---|---|
| P2-1 | Custo | **Sem prompt caching** dos prefixos estáveis (system.md+voz+config). Contabilidade já pronta (`CACHE_READ_FACTOR`), só falta `cache_control`. | Maior alavanca de custo. Marcar o bloco system como `ephemeral`. |
| P2-2 | Custo | **Sem Batch API** na Fase B/backfill (−50%, empilha com cache). | Rotear backfill/Fase B pelo Batch. |
| P2-3 | Qualidade | **Diretor de Arte existe mas não plugado** — Carrossel escreve o hero_prompt sozinho, sem o glossário `bjj-visual.md`. | Inserir entre Carrossel e imagegen. |
| P2-4 | Perf | `already_succeeded` varre TODOS os jobs a cada checagem (O(n²)); `jobs/` cresce sem rotação. | Índice em memória; rotação/retenção de log. |
| P2-5 | Dados | **`fontes.yaml` corrompido** por rewrite automático (chaves `rss:` em indentação errada) → alguns feeds de YouTube nunca são lidos, sem erro. | Regenerar limpo + lint de schema. |
| P2-6 | Código | Hack de encoding Windows duplicado em 6+ arquivos. | Um helper `lib/console.py`. |

---

## 🎨 Design — veredito "cara de IA"

Ossos bons (estrutura editorial, kickers mono, dark mode, admin competente), mas 5 tells de protótipo:
1. **Thumbnails são gradiente vazio** (sem foto real) — o maior. Agora temos imagem, dá pra preencher.
2. **Gradiente + glow radial** como muleta em tudo.
3. **Fonte `system-ui`** — sem identidade tipográfica.
4. **Cores arco-íris** nas categorias — dilui o preto/branco/cinza/vermelho.
5. Toques de cópia genéricos.

**Direção:** marca de mídia de combate — foto-first, tipografia forte (display + texto, self-hosted), paleta disciplinada, sem gradiente decorativo. Editorial, não "dashboard com glow".

---

## 🗄️ Banco de dados — o cérebro que acompanha os agentes

Princípio: **arquivos continuam sendo o artefato imutável; o Postgres é o índice consultável + estado operacional + a memória dos agentes e da conversão.**

Tabelas centrais (esqueleto):
- **`dossiers`** (+ `dossier_facts`, `dossier_angles`, `dossier_athletes`, `athletes`) — Fase A normalizada.
- **`pieces`** (+ `piece_state_transitions` pro workflow com auditoria) — Fase B; FK pro dossiê (1 dossiê → N peças) e pro `angle` usado.
- **`platform_packages`** (1 por peça×canal, `payload jsonb`, fila de publicação/agendamento).
- **`art_assets`** — metadados dos PNGs (binário fica em storage).
- **`sources`**, **`products`** — do `fontes.yaml`/`catalogo.yaml`.
- **`agent_runs`** + **`agent_steps`** — 🔑 uma linha por passo de agente (step/model/tokens/custo/latência/status), ligada ao dossiê/peça. Índice `(step,key,status)` → **resume O(1)** e observabilidade real por agente/modelo. *É a resposta do "acompanhar os agentes".*
- **`events`** + view `mv_conversion_by_angle_format` — 🔑 o funil que o `clicks.csv` deveria ser. **Fecha o loop:** o Supervisor aprende produto×ângulo×formato que converte. Hoje esse loop **não existe**.
- **`topics`/`ingested_urls`** + **pgvector** — dedup semântico (o `embedding_ref` sempre reservado, nunca usado).

Extensões: `pgvector`, `pg_trgm`, `pgcrypto`. Enums pro vocabulário controlado. Partição por mês em `agent_steps` e `events` (as duas mangueiras). Migração: importador idempotente por slug (lê os arquivos), dual-write nos poucos pontos que já escrevem, flip de leitura gradual, RLS (pipeline=service-role server-side; portal=anon read publicado; admin=auth).

---

## Sequência de execução recomendada
1. **Decidir a estratégia de imagem** (P0-1) — muda a arte E o design foto-first.
2. **Repaginar o design** (tipografia, paleta, foto-first, sem gradiente).
3. **Banco:** SQLs (schema + índices + RLS + enums) → você roda; `.env` com nomes das variáveis.
4. **Hardening P0/P1 do pipeline** (teto global, auth do admin, allowed_domains, source_url, resume, disclosure determinístico, alertas).
5. **Custo:** prompt caching + Batch.
