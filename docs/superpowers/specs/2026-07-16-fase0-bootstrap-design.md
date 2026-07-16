# Spec — Fatia 1 · Fase 0: Bootstrap

**Data:** 2026-07-16 · **Projeto:** BjjcomLucas AI Platform · **Base:** PRD v5.0 (§14, §21)
**Objetivo da fatia:** a base de conhecimento nasce cheia com o acervo do AlohaBJJNews e a voz da marca destilada, sobre um esqueleto de repositório pronto para produção.

---

## 1. Escopo (o que esta fatia entrega)

1. **Esqueleto do repo** — estrutura de pastas do PRD §18, config base, observabilidade de custo desde o primeiro run.
2. **Ingestão determinística do Aloha** — os 43 posts do `alohabjjnews.com` via WP REST → raw store limpo. **Sem IA, sem chave de API.**
3. **Destilação da voz** — Analista (Opus) lê os 43 artigos → `config/voz.md`. **Requer `ANTHROPIC_API_KEY`.**
4. **Conversão em dossiês** — Analista (Opus) sobre o raw store → dossiês no formato §9.1. **Requer `ANTHROPIC_API_KEY`.**

**Fora de escopo (fatias futuras):** Radar/Dedupe/Pesquisador/Validador (Fase 1), geração em batch, render de slides, painel React, publisher, tracking. Embeddings de dedupe ficam com `embedding_ref: null` por enquanto.

### Execução: build agora, run pago quando a chave estiver viva
- **Etapas 1 e 2** rodam nesta sessão (custo zero, determinístico) → base com dados reais imediatamente.
- **Etapas 3 e 4** são construídas completas e prontas; disparam com um comando quando `ANTHROPIC_API_KEY` com billing estiver no ambiente (previsto para hoje). Sem retrabalho.

---

## 2. Fontes de verdade (verificadas, não suposição)

WP REST API do Aloha aberta e respondendo (checado em 2026-07-16):
- `X-WP-Total: 43` posts · 6 categorias · timezone `America/Sao_Paulo`
- Stack: WordPress + GeneratePress + RankMath
- Descrição oficial: *"Portal de notícias e análises do Jiu-Jitsu mundial com curso completo gratuito de BJJ"* → confirma o **curso gratuito** como produto-âncora (§12).

Backfill é trivial: 43 posts cabem em 1 página com `per_page=100`, sem risco de rate-limit.

---

## 3. Estrutura do repositório (esta fatia)

```
bjj-lucas/
├── docs/
│   ├── PRD-BjjcomLucas-v5.md          # movido para cá
│   └── superpowers/specs/2026-07-16-fase0-bootstrap-design.md
├── config/
│   ├── fontes.yaml                    # movido para cá (existente)
│   ├── empresa.md                     # fatos da marca (do WP)
│   ├── voz.md                         # GERADO na etapa 3
│   ├── regras.md                      # direitos de imagem + brand tokens
│   └── catalogo.yaml                  # produtos: curso > BJJ3D > afiliado
├── knowledge/
│   ├── _backfill/<slug>.md + .json    # raw store da etapa 2
│   └── <slug>/                        # dossiês da etapa 4 (summary/facts/angles/metadata)
├── agents/
│   ├── analyst/system.md              # prompt do Analista (versionado)
│   └── voice_distiller/system.md      # prompt da destilação de voz
├── ingestion/
│   ├── wp_backfill.py                 # etapa 2
│   ├── html_clean.py                  # HTML → texto limpo
│   └── resolve_channels.py            # movido para cá (existente)
├── orchestrator/
│   ├── distill_voice.py               # etapa 3
│   └── build_dossiers.py             # etapa 4
├── lib/
│   ├── jobs.py                        # run_id, jsonl log, idempotência
│   └── claude.py                      # cliente Anthropic + roteamento + spend cap + custo
├── jobs/                              # <run_id>.jsonl (observabilidade)
├── .env.example                      # ANTHROPIC_API_KEY, (futuro) VOYAGE_API_KEY
├── .gitignore                        # .env, __pycache__, .venv
├── requirements.txt
└── README.md
```

Arquivos existentes (`PRD`, `fontes.yaml`, `resolve_channels.py`) são **movidos** para os lugares certos do §18, não recriados.

---

## 4. Componentes (unidades com uma responsabilidade cada)

### 4.1 `ingestion/wp_backfill.py` — Import determinístico (etapa 2)
- **Faz:** `GET /wp-json/wp/v2/posts?per_page=100&_embed=1`, pagina até esgotar; para cada post grava raw store.
- **Entrada:** URL base do site (`https://alohabjjnews.com`).
- **Saída por post:** `knowledge/_backfill/<slug>.md` (frontmatter YAML + texto limpo) e `<slug>.json` (metadados estruturados: `id, slug, date, modified, title, link, categories[], tags[], featured_image, source: alohabjjnews`).
- **Limpeza HTML:** `html_clean.py` (BeautifulSoup, `html.parser` nativo — sem lxml), remove script/style, preserva parágrafos.
- **Idempotência:** pula post cujo `modified` não mudou; loga em `jobs/`.
- **Dependências:** `requests`, `beautifulsoup4`. **Sem chave de API.**

### 4.2 `orchestrator/distill_voice.py` — Voz da marca (etapa 3)
- **Faz:** concatena os 43 artigos do raw store → prompt para o Analista (Opus) destilar tom, gírias BJJ-BR, do/don't → grava `config/voz.md`.
- **Nota de fonte:** o PRD cita posts do @bjjcomlucas + artigos do Aloha. Instagram não é raspável (regra §5), então a voz é destilada dos **43 artigos do Aloha** (fonte legítima e suficiente). Registrado como decisão consciente.
- **Depende de:** `lib/claude.py`, `agents/voice_distiller/system.md`, `ANTHROPIC_API_KEY`.

### 4.3 `orchestrator/build_dossiers.py` — Dossiês (etapa 4)
- **Faz:** para cada post do raw store, roda o Analista (Opus) com saída estruturada (tool use / JSON forçado) → grava `knowledge/<slug>/{summary.md, facts.md, angles.md, metadata.json}` (§9.1).
- **`metadata.json`:** `slug, tags, atletas[], evento, data, confianca, angulos_usados[], embedding_ref: null, source_url`.
- **Regra das 2 fontes (§7):** no backfill a fonte é o próprio artigo Aloha (1 fonte) → fatos entram com `status: nao_confirmado` por padrão, honesto quanto à procedência. Não inventa segunda fonte.
- **Idempotência/resumível:** pula slug já processado; loga token+custo por item.
- **Batch:** para 43 itens one-time, execução **síncrona** (Messages API) é mais simples e suficiente; otimização via Batch API 50% off fica anotada para quando o volume justificar.
- **Depende de:** `lib/claude.py`, `agents/analyst/system.md`, `ANTHROPIC_API_KEY`.

### 4.4 `lib/claude.py` — Cliente + guardrails de produção
- Wrapper do SDK `anthropic`; lê `ANTHROPIC_API_KEY` do ambiente.
- **Roteamento de modelo** por constante (Haiku/Sonnet/Opus) — IDs exatos confirmados via skill `claude-api` na implementação (não chutados).
- **Spend cap:** aborta se custo acumulado do run passar `SPEND_CAP_USD` (env, default 10).
- **Custo por chamada:** calcula `in_tok/out_tok/cost_est` e delega o log a `lib/jobs.py`.

### 4.5 `lib/jobs.py` — Observabilidade e idempotência
- Gera `run_id`; append em `jobs/<run_id>.jsonl` no formato §9.3 (`step, custom_id?, status, model, in_tok, out_tok, cost_est, t0, t1, error?`).
- Helper `already_succeeded(step, key)` para pular trabalho refeito.

---

## 5. Config a ser escrita agora (determinística, sem chave)

- **`config/empresa.md`** — fatos da marca extraídos do WP (nome, descrição, curso gratuito, URL, timezone).
- **`config/catalogo.yaml`** — `curso` (margem ~100%, prioridade 1), `bjj3d` (Shopee, próprio), `hayabusa` (afiliado, `disclosure_obrigatorio: true`). Formato do §9.2.
- **`config/regras.md`** — política de direitos de imagem (§11/§22) + **brand tokens** placeholder (cores/tipografia) para slides e painel das próximas fatias.
- **`.env.example`** — `ANTHROPIC_API_KEY=`, `SPEND_CAP_USD=10`, `# VOYAGE_API_KEY=` (futuro).

---

## 6. Fluxo de execução

```
# Etapa 1: já feito (esqueleto + config)
# Etapa 2 (grátis, roda agora):
python -m ingestion.wp_backfill            # 43 posts → knowledge/_backfill/
# Etapas 3-4 (quando ANTHROPIC_API_KEY viva):
python -m orchestrator.distill_voice       # → config/voz.md
python -m orchestrator.build_dossiers      # → knowledge/<slug>/*
```

Cada comando é idempotente e resumível; todos logam custo em `jobs/`.

---

## 7. Requisitos não-funcionais (produção desde o dia 1)

- **Segredos:** `.env` nunca commitado; `.env.example` documenta.
- **Determinístico vs pago:** etapas grátis isoladas das que gastam token → verificáveis sem custo.
- **Observabilidade:** custo/token por etapa desde o primeiro run.
- **Idempotência:** todo passo resumível, pula o que já teve sucesso.
- **Spend cap:** guarda-chuva de custo em toda chamada de IA.
- **Design/UI:** fora desta fatia (não há UI). Brand tokens preparados em `regras.md` para a Fatia 2 (painel + slides, com skill de design, Shadcn, "clean e profissional").

---

## 8. Critérios de aceite

- [ ] Repo estruturado conforme §18; arquivos existentes movidos, não duplicados.
- [ ] `wp_backfill.py` roda sem chave e gera **43** pares `.md/.json` em `knowledge/_backfill/`.
- [ ] Texto limpo legível (sem tags HTML/script) e metadados corretos (categorias, data, URL).
- [ ] `distill_voice.py` e `build_dossiers.py` completos, testáveis com `--dry-run` sem chave; executam de verdade quando a chave estiver ativa.
- [ ] Todo run registra custo em `jobs/`.
- [ ] `git log` com a fatia commitada.
```
