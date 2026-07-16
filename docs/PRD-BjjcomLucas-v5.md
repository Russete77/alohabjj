# PRD — BjjcomLucas AI Platform

**Versão 5.0 (definitiva, pronta para produção)** · Nicho: Brazilian Jiu-Jitsu · Marca: AlohaBJJNews / @bjjcomlucas
*Consolida v4.0 + estudo de lacunas: publicação (hand-off manual custo-zero, escalável), compliance CONAR, caption/hashtags, modelo de custo, embeddings hospedados, bootstrap de voz + backfill, localização PT-BR e camada de operação. Escrito para desenvolvedor.*

---

## 1. Visão e princípio

Plataforma que transforma acontecimentos do BJJ em **dossiês permanentes** (base de conhecimento alimentada diariamente) e reusa cada dossiê para gerar conteúdo multi-formato automatizado, sempre mirando conversão.

**Princípio-mestre:** *pesquisar/validar uma vez, gerar muitas vezes.* A fase cara (pesquisa + validação + análise) roda 1x por dossiê; a geração consome o dossiê pronto, barata e em paralelo. A base é o ativo central que serve todo o sistema.

---

## 2. Escopo da V1

Todo dia, sem operação manual na geração:

- **3 carrosséis** (Instagram, slides renderizados + caption + hashtags)
- **Short-form scripts** (1 roteiro serve Reels + TikTok + Shorts)
- **YouTube long-form scripts**
- **Base de conhecimento** crescente, deduplicada e em PT-BR
- **Brief de conversão** + **caption com divulgação CONAR** + **link rastreável**

**Publicação (decidido): custo zero, escalável.** Na V1 você aprova no painel e **posta manual** (assets + caption prontos pra copiar). A arquitetura já deixa o gancho pronto pra plugar uma **API unificada de publicação** (Postproxy/Ayrshare) na Fase 3, sem retrabalho.

**Cadência:** batch diário (evergreen) + rodada síncrona por evento (notícia quente).

---

## 3. Arquitetura de duas fases

> **Regra dura:** o Batch API dá 50% off mas **não roda loops de agente multi-turno** (só single-shot). Pesquisa = síncrona; geração = batch.

```
╔════════ FASE A — INTELIGÊNCIA (síncrona, Agent SDK) ════════╗
║ Scheduler → Orquestrador                                    ║
║  Radar → Dedupe → Pesquisador → Validador → Analista(PT-BR) ║
║  (RSS/web/YT)(embed)  (loop+tools)  (2 fontes)  (monta dossiê)║
║                    ▼                                         ║
║        knowledge/<slug>/*.md + metadata.json                ║
╚═════════════════════════════════════════════════════════════╝
                         │ dossiês validados do dia
                         ▼
╔════════ FASE B — GERAÇÃO (batch 50% off, single-shot) ══════╗
║ Supervisor de Vendas (brief + disclosure) ─┐                ║
║ Carrossel │ Short-form │ YouTube            ├─► outputs/*    ║
║ Avaliador (quality gate, Haiku) ◄───────────┤   (+ caption) ║
║ Render de slides (HTML→PNG) ◄───────────────┘               ║
╚═════════════════════════════════════════════════════════════╝
                         ▼
     Painel de Aprovação (aprova/refaz) → export manual + tracking
                         ▼
   (Fase 2) Visualização pixel art · (Fase 3) API unificada de post
```

**Janela de cache:** rode toda a Fase B junta dentro do TTL (5 min/1 h) → dossiê escrito no cache 1x, lido N vezes a 10% do custo; batch aplica mais 50%. Empilha para ~5% do custo padrão na parte repetida.

---

## 4. Runtime, orquestração e modelos

**Fase A — Agent SDK headless.** `pip install claude-agent-sdk`. Subagentes com `system.md` fixo e `allowed_tools` restrito. Auth por `ANTHROPIC_API_KEY`. Guardrails obrigatórios: turn limit, spend cap, permission mode explícito. Hooks (`SessionStart/PreToolUse/PostToolUse/Stop`) alimentam Visualização (Fase 2) e alertas (§17).

**Fase B — Batch API.** `client.messages.batches.create` com `custom_id` por peça. Sem webhook → polling a cada 30–60s até `ended`. Falha por item → reprocessa só `errored`/`expired`. Resultados ~29 dias → copiar para storage durável. Empilha com cache.

**Roteamento de modelo (preços atuais, USD/MTok in/out):**

| Etapa | Modelo | Padrão | Batch | Cache-hit (in) |
|---|---|---|---|---|
| Relevância/dedupe/tag/quality gate | **Haiku 4.5** | $1 / $5 | $0.50 / $2.50 | $0.10 |
| Geração (carrossel, short-form, YT) | **Sonnet 5** | $3 / $15 *(intro $2/$10 até 31/ago/26)* | $1.50 / $7.50 | $0.30 |
| Analista / síntese de dossiê | **Opus 4.8** | $5 / $25 | $2.50 / $12.50 | $0.50 |

Output = 5x input. Extended thinking conta como output. Web search/code exec = taxa de ferramenta à parte.

---

## 5. Fontes e ingestão

**Regra:** web/RSS/YouTube = fonte; Instagram/TikTok = distribuição/conversão (nunca leitura automatizada — API restrita, raspagem viola ToS).

**Allowlist (`config/fontes.yaml`):** FloGrappling · BJJ Heroes (fonte-verdade de atletas) · BJJ News (agregador) · Jits Magazine · orgs (ADCC, IBJJF, CJI, Polaris, UFC BJJ, BJJ Stars, CBJJ, F2W) · YouTube · AlohaBJJNews (próprio).

**YouTube — Xadrez Humano** (`@XadrezHumano`), RSS:
`https://www.youtube.com/feeds/videos.xml?channel_id=UC62rRqWUkgACf6Yyxy-L8iA`

### 5.1 YouTube a baixo custo (transcrição, não vídeo)
RSS detecta vídeo novo (grátis) → transcrição via **serviço gerenciado** (legenda grátis + IA só sem legenda; endpoint de canal; evita bloqueio de IP e zona cinzenta de ToS que a lib aberta `youtube-transcript-api` sofre em servidor) → Haiku extrai fatos (texto = barato). Sem legenda → Whisper só para alto valor.

### 5.2 Descoberta de canais (semanal)
Sub-passo do Radar propõe canais candidatos; entram em `fontes.yaml` **só após sua aprovação** (curadoria humana).

---

## 6. Deduplicação (com embeddings hospedados)

> **Nota técnica:** a Anthropic **não** tem modelo de embedding próprio. Como a infra é nuvem-simples, o dedupe usa **embedding hospedado** (Voyage AI — parceiro recomendado — ou OpenAI embeddings) + **FAISS** só como índice local ao repo.

- **Slug canônico** por evento/atletas/data (`2026-09-12-adcc-worlds-krakow`) → se existe, **enriquece** em vez de recriar.
- **Similaridade semântica** dos `summary.md` (embeddings) acima de threshold → mesmo tópico.
- **Dedupe de ângulo:** `metadata.angulos_usados[]` evita repetir ângulo publicado.

---

## 7. Validação e precisão de domínio

- **Regra das 2 fontes:** fato entra em `facts.md` só com ≥2 fontes independentes; fonte única → `status: nao_confirmado`.
- **Fato vs rumor** rotulado; **confiança** (`alta/media/baixa`) muda o tom do gerador.
- **Precisão de domínio:** nomes/graduações/resultados checados contra **BJJ Heroes**. Fonte primária (organização) > agregador > canal.

---

## 8. Localização PT-BR

Fontes majoritariamente em inglês; conteúdo em português. A **tradução/localização acontece no Analista** — o dossiê nasce em PT-BR com gíria de BJJ brasileira, e todo formato herda o idioma certo.

---

## 9. Modelo de dados

### 9.1 Dossiê (arquivo, enxuto)
```
knowledge/<slug>/
├── summary.md      # resumo + contexto (PT-BR)
├── facts.md        # fatos validados {texto, fonte, status}
├── angles.md       # ângulos; ≥1 de conversão
└── metadata.json   # slug, tags, atletas, evento, data, confianca, angulos_usados[], embedding_ref
```
`timeline/quotes/references` entram na Fase 2 (Artigo/YouTube).

### 9.2 Conversão + tracking (V1)
```
config/catalogo.yaml     # {id, tipo:curso|proprio|afiliado, url_base, margem, gancho, disclosure_obrigatorio}
outputs/<peca>/meta.json # {dossie, formato, angulo, produto_id, cta, caption, hashtags, tracked_url, disclosure}
tracking/clicks.csv      # {timestamp, tracked_url, peca, produto_id}
```
`tracked_url` = destino (curso/BJJ3D/Hayabusa) + UTM (`utm_source=ig&utm_content=<peca_id>`). Sinal de conversão sem API da Meta.

### 9.3 Jobs (idempotência + observabilidade)
```
jobs/<run_id>.jsonl  # {step, dossie?, custom_id?, status, prompt_version, model, in_tok, out_tok, cost_est, t0, t1, error?}
```
Resumível (pula `succeeded`). Loga token+custo por etapa desde o dia 1.

---

## 10. Agentes

| Agente | Fase | Modelo | Entrega |
|---|---|---|---|
| Radar | A | Haiku | pautas + (semanal) canais candidatos |
| Dedupe | A | Haiku + embedding | novo tópico? / enriquecer |
| Pesquisador | A | Sonnet | pesquisa + transcrição YT |
| Validador | A | Sonnet | fatos + confiança |
| Analista | A | Opus | dossiê estruturado PT-BR |
| Supervisor de Vendas | B | Sonnet | brief (produto+CTA) + **disclosure CONAR** |
| Carrossel | B | Sonnet | slides + **caption + hashtags + 1º comentário** |
| Short-form | B | Sonnet | roteiro Reels/TikTok/Shorts + caption |
| YouTube | B | Sonnet | roteiro long-form + título/descrição |
| Avaliador (quality gate) | B | Haiku | nota + aprova/rejeita antes do painel |
| Render de slides | B | código | HTML→PNG |

Agentes da Fase B nunca acessam a internet. Prompts em `agents/<nome>/system.md`, versionados.

---

## 11. Render de slides

Template HTML/CSS com tokens da marca (cores, tipografia, logo do AlohaBJJNews) → **Playwright** → PNG. O agente preenche variáveis, não desenha do zero (consistência + custo ~zero de IA na parte gráfica). Imagem de atleta: assets próprios/licenciados; política de direitos em `config/regras.md`.

---

## 12. Supervisor de Vendas + Conversão + Compliance

- **Catálogo** (`config/catalogo.yaml`): curso, BJJ3D (Shopee), afiliados (Hayabusa+), cada um com margem/comissão/gancho.
- **Prioridade (decidida):** **curso** (margem ~100%, digital) → **BJJ3D próprio** → **afiliado**. Relevância acima de margem; sem encaixe honesto → não força.
- **Formato:** integrado (CTA suave no último slide) ou separado (peça de venda), por dossiê. **1 CTA por peça.**
- **Compliance CONAR 2026 (obrigatório):** para afiliado (Hayabusa) OU produto próprio, o Supervisor **injeta divulgação clara e imediata** (selo nativo "parceria paga"/"conteúdo promocional" + #publi) já na 1ª linha da caption — remuneração por performance (clique/venda/cupom) não afasta o caráter publicitário, e "link na bio" não conta como divulgação. Se houver avatar de IA da marca, rotular como artificial. *(Não é aconselhamento jurídico; confirmar com advogado.)*
- **Aprende** com `tracking/clicks.csv` (produto×ângulo×formato) via Memória.

---

## 13. Publicação (custo zero, escalável)

**V1 — manual, custo zero.** O painel entrega, por peça aprovada: PNGs dos slides (ou vídeo), **caption pronta com disclosure**, hashtags, `tracked_url` e um botão "copiar". Fila de estados: `gerado → aprovado → postado`. Você posta.

**Gancho de escala (Fase 3) — API unificada.** Um `publisher` com interface única (`publish(peca)`) implementado hoje como "export manual"; depois trocado por um provedor pré-auditado (Postproxy/Ayrshare/Post for Me) que posta IG+TikTok+YouTube por um endpoint — sem App Review da Meta (2–4 sem.) nem auditoria do TikTok (2–4 sem., SELF_ONLY até passar). **Atenção compliance de plataforma:** o TikTok exige a flag `is_ai_generated=true` em conteúdo de IA (não marcar → risco de shadow ban) e proíbe watermark/logo via API; o `publisher` já deve carregar esses campos no `meta.json` desde a V1.

---

## 14. Bootstrap (para a V1 não nascer vazia)

- **Voz da marca (job único):** destilar `config/voz.md` a partir dos posts do @bjjcomlucas e artigos do AlohaBJJNews. Define tom, gírias, do/don't. É o que separa conteúdo bom de genérico.
- **Cold-start da base (backfill):** importar o acervo do AlohaBJJNews via **WP REST API** (`/wp-json/wp/v2/posts`) → converter em dossiês iniciais. A base nasce cheia e o Supervisor já tem munição no dia 1.

---

## 15. Stack

- **Fase A:** Python · Claude Agent SDK · embedding hospedado (Voyage/OpenAI) + FAISS
- **Fase B:** Python · Batch API · Playwright (render)
- **Fontes:** RSS · serviço gerenciado de transcrição YT · WebSearch/WebFetch · WP REST (backfill)
- **Painel:** React · TS · Vite · Tailwind · Shadcn (lê outputs + `clicks.csv`; export manual)
- **Publisher:** interface `publish()` (V1: export; Fase 3: API unificada)
- **Orquestração:** Python + `cron` + gatilho por evento
- **Storage V1:** `.md/.json/.csv` em Git → Postgres+SQLAlchemy na Fase 3
- **Segredos:** `.env` + secrets manager da nuvem
- **Visualização (Fase 2):** repo pixel art via hooks (base: `rafapetter/agent-town`)

---

## 16. Eficiência de tokens

1. Reuso da arquitetura (pesquisa 1x, geração N).
2. **Cache placement (regra dura):** `tools → system → config → dossiê`; `cache_control` no fim do bloco estático; dinâmico por último. Cache-hit ≈ 10% do input; write 1,25x; break-even em 2 leituras.
3. **Batch + cache empilham** (~5% do padrão) — Fase B junta na janela de TTL.
4. Roteamento Haiku/Sonnet/Opus (§4).
5. Contexto enxuto: cada gerador recebe só `summary`+`angles`.
6. Fonte = texto (RSS/transcrição), sem token de "descoberta".

**Fórmula do teto diário:** `custo ≈ Σ_etapa (in×taxa_in + out×taxa_out) × (0.5 se batch) × (0.1 no input se cache-hit)`. Ordem de grandeza V1: poucos US$/dia com cache+batch+roteamento certos; ~10x sem. Número real sai da observabilidade (§9.3).

---

## 17. Operação (o que quebra às 3h)

- **Alertas de falha:** hook `Stop` com erro → Telegram/e-mail.
- **Quality gate:** Avaliador (Haiku, LLM-as-judge) barra lixo antes do painel — você não vira o filtro manual.
- **SLA de aprovação:** política se você sumir (fila acumula / confiança alta pode auto-aprovar / pausa).
- **Rate limits:** RPM/ITPM/OTPM por tier (cache-hit normalmente não conta no ITPM); backoff exponencial; polling educado no RSS.
- **Versionamento de prompts:** `system.md` versionado; `run_id` registra qual versão gerou o quê → habilita A/B de CTA e otimização de conversão.
- **Backup + trigger de migração:** repo é dado crítico (backup); `knowledge/` > alguns milhares de dossiês → migrar pra Postgres.

---

## 18. Estrutura de pastas

```
bjjcomlucas/
├── docs/                 # este PRD
├── config/               # empresa/voz/tom/regras.md · fontes.yaml · catalogo.yaml
├── knowledge/            # dossiês (§9.1)
├── memory/               # performance/patterns/templates/lessons
├── agents/               # radar dedupe researcher validator analyst sales carousel shortform youtube evaluator (system.md versionados)
├── orchestrator/         # fase A sync + fase B batch + polling + reconcile + alerts
├── ingestion/            # rss, yt_transcript, wp_backfill, embeddings
├── render/               # templates HTML + Playwright → PNG
├── publisher/            # interface publish() (V1 export → Fase 3 API unificada)
├── outputs/              # carousel/shortform/youtube (+ meta.json)
├── tracking/             # clicks.csv, utm
├── jobs/                 # <run_id>.jsonl
├── visualization/        # Fase 2
├── panel/                # frontend React
├── scripts/ · logs/ · tests/
```

---

## 19. Fluxo diário

```
[cron] → eventos → Visualização
FASE A (sync):
  Radar(RSS/web/YT) → relevância(Haiku) → Dedupe(embedding+FAISS)
  → tópico novo: Pesquisador(+transcrição) → Validador(2 fontes) → Analista(PT-BR) → dossiê
FASE B (batch, na janela de cache):
  Supervisor(brief+disclosure) → fan-out Carrossel|Short-form|YouTube (+caption+hashtags)
  → Avaliador(quality gate) → Render(HTML→PNG)
  → polling até ended → reconcile por custom_id → outputs/
[Painel] aprova/refaz → export manual (assets+caption) → você posta → clicks.csv
[notícia quente] → mesma A/B em modo síncrono, fora do cron
```

---

## 20. Memória / aprendizado

`memory/`: performance, patterns, templates, lessons. Alimentada pelas marcações do painel + `clicks.csv`. Aprende qual produto×ângulo×formato converte → insumo do Supervisor. Fecha o ciclo sozinha na Fase 4 (métricas da Meta).

---

## 21. Roadmap de build (completo, incremental)

**Fase 0 — Bootstrap:** `config/` + destilar voz + backfill do AlohaBJJNews (base nasce cheia).

**Fase 1 — Núcleo end-to-end:** jobs/observabilidade + Radar+Dedupe → Pesquisador → Validador → Analista → dossiê; Supervisor+disclosure + Carrossel + caption + Render + Avaliador + tracking + painel com export manual. **Meta: 3 carrosséis/dia publicáveis, com caption+disclosure e link rastreável, aprovados por você.**

**Fase 2 — Multi-formato + Visualização:** Short-form + YouTube; escritório pixel art; `timeline/quotes/references`.

**Fase 3 — Publicação automática + venda:** `publisher` → API unificada (IG/TikTok/YT, com `is_ai_generated`), ManyChat (DM→link), WordPress auto, Postgres.

**Fase 4 — Autonomia:** métricas da Meta fecham a Memória, resposta a comentários, agentes mais autônomos.

---

## 22. Riscos e decisões

| Tema | Ação |
|---|---|
| Batch ≠ agent loop | Pesquisa sync, geração batch (§3) |
| Publicação | Manual custo-zero na V1; `publisher` com interface pronta pra API unificada |
| Compliance CONAR | Disclosure injetada na caption (§12); confirmar com advogado |
| AI disclosure plataforma | `is_ai_generated` no `meta.json`; avatar de IA rotulado |
| Embeddings | Hospedado (Voyage/OpenAI), não local |
| Direitos de imagem | Política em `regras.md`; assets próprios/licenciados |
| Custo | Spend cap + observabilidade por etapa + cache/batch obrigatórios |
| ToS YouTube | Transcrição gerenciada, não raspagem |
| Validação | Regra das 2 fontes rígida — escudo da marca |
| Base vazia / voz genérica | Bootstrap (§14) antes da Fase 1 |
| Falha silenciosa | Alertas no `Stop` (§17) |

---

*Fim do PRD v5.0. Fase A síncrona alimenta a base PT-BR todo dia; Fase B em batch gera 3 carrosséis + short-form + YouTube com slides renderizados, caption com disclosure CONAR, quality gate e link rastreável; publicação manual custo-zero com gancho pronto pra escalar. Curso → BJJ3D → afiliado. Nuvem, sem modelo local.*
