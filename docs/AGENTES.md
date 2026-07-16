# Agentes — catálogo, workflow e revisão

> Estado em 2026-07-16. Cada agente tem prompt versionado em `agents/<nome>/system.md`. Modelos via `lib/claude.py` (roteamento Haiku/Sonnet/Opus). Observabilidade em `jobs/*.jsonl`.

## 1. Workflow completo (como se conectam)

```
BOOTSTRAP (1x)
  Voice distiller (Opus) ── lê acervo ──► config/voz.md

FASE A — INTELIGÊNCIA (síncrona)                          orquestrador: orchestrator/phase_a.py
  Radar ──► Dedupe ──► [tópico novo] Pesquisador ──► Validador ──► Analista ──► knowledge/<slug>/
  (RSS,     (slug+      (WebSearch,      (regra 2       (dossiê,
   Haiku)    embed)      Sonnet)          fontes,        Opus)
                                          Sonnet)
        │ ingestion/rss.py (RSS ao vivo, determinístico) alimenta o Radar

FASE B — GERAÇÃO (batch)                                  orquestradores: build_carousel.py, build_platforms.py
  Supervisor de Vendas ──► Carrossel ──► [Diretor de Arte ──► imagegen] ──► Avaliador ──► Render ──► Empacotador
  (produto+CTA+CONAR,      (slides na    (prompt de arte,    (Gemini/     (quality    (HTML→PNG)  (pacotes por
   Sonnet)                  voz, Sonnet)  Opus) (Gemini/GPT)  Runway)      gate, Haiku)             plataforma, Sonnet)
                                                                                          │
                                                            outputs/<slug>/ ──► /admin (você aprova) ──► portal

AO VIVO: lib/claude registra running/succeeded em jobs/ ; /api/agents/activity alimenta a Academia (agent-town)
```

## 2. Resumo (11 agentes)

| Agente | Fase | Modelo | Entrada → Saída | Onde roda |
|---|---|---|---|---|
| **Voice distiller** | boot | Opus | acervo → `config/voz.md` | `distill_voice.py` |
| **Radar** | A | Haiku | RSS/YouTube → pautas + relevância | `ingestion/rss.py` (+ prompt) |
| **Dedupe** | A | Haiku+emb | pauta → novo/enriquecer | `orchestrator/dedupe.py` |
| **Pesquisador** | A | Sonnet | pauta → material (≥2 fontes) | `phase_a.process_topic` |
| **Validador** | A | Sonnet | material → fatos + confiança | `phase_a.process_topic` |
| **Analista** | A | Opus | tudo → dossiê §9.1 | `build_dossiers.py` / `phase_a` |
| **Supervisor de Vendas** | B | Sonnet | dossiê+catálogo → brief + CONAR | `build_carousel.py` |
| **Carrossel** | B | Sonnet | dossiê+brief+voz → slides+caption | `build_carousel.py` |
| **Diretor de Arte** | B | Opus | dossiê → prompt de imagem correto | ⚠️ prompt existe, **não plugado** |
| **Avaliador** | B | Haiku | peça → aprova/rejeita | `build_carousel.py` |
| **Empacotador** | B | Sonnet | peça → pacotes por plataforma | `build_platforms.py` |

Padrão de cada prompt (v2/v3): papel+expertise · princípios · protocolo de 2 passes · contrato de saída · rubrica de auto-verificação · anti-padrões · exemplo.

## 3. Revisão por agente (estado + melhorias)

### Voice distiller (Opus)
- **Estado:** rodado 1x; `voz.md` fiel ao acervo.
- **Melhorias:** refrescar periodicamente conforme sai conteúdo novo; incorporar posts do @bjjcomlucas (IG não é raspável → colar manual). **Prioridade: baixa.**

### Radar (Haiku)
- **Estado:** a ingestão RSS ao vivo (`ingestion/rss.py`) funciona (17 fontes); **o filtro de relevância Haiku NÃO está plugado** no `phase_a` (hoje vai RSS→dedupe direto).
- **Melhorias:** (1) plugar a relevância Haiku (pontuar cada pauta, cortar <6) — **em lote numa chamada só** (barato); (2) descoberta semanal de canais (`canais_candidatos.yaml`) não implementada; (3) ponderar por prioridade da fonte + recência/calendário de eventos; (4) emitir evento no `jobs/` pra acender na Academia. **Prioridade: alta.**

### Dedupe (Haiku + embeddings)
- **Estado:** slug canônico + similaridade **léxica grátis** (embeddings hospedados são opcionais). O caminho **"enriquecer" não está implementado** (o `phase_a` só processa "novo").
- **Melhorias:** (1) embeddings hospedados (Voyage) + **índice FAISS persistido** (hoje recomputa a cada run); (2) implementar o fluxo de enriquecer (append no dossiê existente); (3) enforce do dedupe de **ângulo** (`angulos_usados`). **Prioridade: alta.**

### Pesquisador (Sonnet, WebSearch)
- **Estado:** usa web_search server-side; pronto p/ a chave.
- **Melhorias (correção real):** hoje busca na **web inteira** — deve restringir aos domínios da **allowlist** (`fontes.yaml`) via `allowed_domains` do web_search (§5 do PRD). (2) transcrição gerenciada de YouTube não implementada; (3) taggear o **domínio de cada fonte** pra o Validador contar fontes independentes. **Prioridade: alta (allowlist é correção).**

### Validador (Sonnet)
- **Estado:** schema com regra das 2 fontes.
- **Melhorias:** (1) contar **domínios distintos** (depende do Pesquisador taggear); (2) checagem dirigida contra **BJJ Heroes** pra nomes/graduações/resultados; (3) rotular fato×rumor com mais rigor. **Prioridade: média.**

### Analista (Opus)
- **Estado:** v3, forte (protocolo 2 passes + exemplo). 43 dossiês gerados.
- **Melhorias:** (1) **prompt caching** do prefixo estável (voz+config) — corta ~90% do custo repetido em muitos dossiês (§16); (2) **Batch API** no backfill (50% off); (3) `timeline/quotes/references` (Fase 2). **Prioridade: alta (custo).**

### Supervisor de Vendas (Sonnet)
- **Estado:** escolhe produto + injeta disclosure CONAR.
- **Melhorias:** (1) **aprender com `tracking/clicks.csv`** (memória: produto×ângulo×formato que converte) — não existe tracking ainda; (2) preencher URLs do catálogo (BJJ3D, afiliado). **Prioridade: média (depende de tracking).**

### Carrossel (Sonnet)
- **Estado:** v2, forte; gera slides+caption+hashtags+hero_prompt.
- **Melhorias:** (1) hoje **ele mesmo** escreve o `hero_prompt` — deveria **delegar ao Diretor de Arte** (que tem o glossário `bjj-visual.md`); (2) A/B de CTA (o versionamento permite, falta wiring); (3) nº de slides automático pela riqueza do dossiê. **Prioridade: alta (delegar arte).**

### Diretor de Arte (Opus)
- **Estado:** prompt criado com `config/bjj-visual.md`, mas **NÃO está no pipeline** (o Carrossel faz o hero_prompt sozinho).
- **Melhorias:** (1) **plugar no `build_carousel`** (Carrossel pede a arte → Diretor decide modo A/B e escreve o prompt correto); (2) fluxo de **reference image** pra peça técnica (hoje só sinaliza `needs_reference`); (3) rebaixar p/ **Sonnet** (escrever prompt não exige Opus → economia). **Prioridade: alta.**

### Avaliador (Haiku)
- **Estado:** v2, quality gate com checagens eliminatórias vs nota.
- **Melhorias:** (1) mover as checagens **determinísticas** (tem 1 CTA? disclosure presente? dentro do limite?) pra **código** antes do LLM (mais barato e confiável); (2) segunda passada adversarial só pra peça de alto valor. **Prioridade: média.**

### Empacotador (Sonnet)
- **Estado:** v1, gera IG feed+Reels, TikTok, YT Shorts.
- **Melhorias:** (1) validar **limite de caracteres por rede em código** (não só no prompt); (2) mais redes (Kwai, Facebook, X); (3) hashtags de tendência dinâmicas. **Prioridade: baixa.**

## 4. Melhorias transversais (afetam vários) — por prioridade

| # | Melhoria | Ganho | Prioridade |
|---|---|---|---|
| 1 | **Prompt caching** do prefixo estável (voz/config/system) em `lib/claude` | ~90% menos custo no input repetido (§16) | 🔴 alta |
| 2 | **Batch API** na Fase B (e backfill) | 50% off + empilha com cache (~5% do padrão) | 🔴 alta |
| 3 | **Restringir Pesquisador à allowlist** (`allowed_domains`) | correção — hoje viola a regra §5 | 🔴 alta |
| 4 | **Plugar Diretor de Arte** no `build_carousel` | arte correta (BJJ, não judô/íntimo) por design | 🔴 alta |
| 5 | **Radar (relevância Haiku) + Dedupe (enriquecer/embeddings)** no `phase_a` | Fase A ao vivo de verdade, base cresce limpa | 🔴 alta |
| 6 | **Memória / tracking** (`clicks.csv` → Supervisor aprende) | conversão melhora sozinha (§20) | 🟡 média |
| 7 | **Checagens determinísticas** no Avaliador (código antes do LLM) | mais barato e à prova de falha | 🟡 média |
| 8 | **Alertas** (hook Stop → Telegram/e-mail) (§17) | você não descobre falha às 3h | 🟡 média |
| 9 | **A/B de CTA** via versionamento de prompt + `run_id` | otimização de conversão | 🟢 baixa |
| 10 | **FAISS persistido** pro dedupe | não recomputa embeddings a cada run | 🟢 baixa |

## 5. Guardrails já ativos (não mexer)
- **Spend cap** por run (`SPEND_CAP_USD`) em toda chamada de IA.
- **Idempotência/resumível** (pula slug já feito).
- **Regra das 2 fontes** (backfill = 1 fonte → `nao_confirmado`).
- **Compliance**: CONAR na caption, `is_ai_generated` no meta, arte sem rosto/pose íntima/judô.
- **Roteamento de modelo** por etapa (Haiku barato → Opus caro só onde importa).

---
*Próximo passo recomendado: as 5 melhorias 🔴 (caching, batch, allowlist, plugar Diretor de Arte, Radar+Dedupe ao vivo) — 3 delas cortam custo, 2 corrigem correção/qualidade.*
