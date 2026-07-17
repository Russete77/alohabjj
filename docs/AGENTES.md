# Agentes — workflow completo (atual)

> Estado em 2026-07-16 (revisão pós-sessão de arte/vendas/banco). 14 agentes + módulos de apoio.
> Prompts versionados em `agents/<nome>/system.md`. Roteamento de modelo em `lib/claude.py`.
> Observabilidade em `jobs/*.jsonl` + dual-write no Supabase (`agent_steps`).

## 1. Fluxo de ponta a ponta

```
BOOTSTRAP (1x)
  Voice Distiller (Opus) ──lê o acervo──► config/voz.md

═══════════ FASE A · INTELIGÊNCIA (síncrona) ═══════ orchestrator/phase_a.py
  RSS (config/fontes.yaml, determinístico, ingestion/rss.py)
    │
    ├─ Radar (Haiku, em LOTE) ── pontua relevância 0–10, corta <6 / perfil de atleta
    ├─ Dedupe (Haiku + embeddings léxicos) ── novo / já-temos / enriquecer
    │  [tópico novo]
    ├─ Pesquisador (Sonnet + web_search, backoff 529) ── apura ≥2 fontes
    ├─ Validador (Sonnet, effort baixo) ── fatos + REGRA DAS 2 FONTES (confirmado/não)
    └─ Analista (Opus) ── dossiê PT-BR ─► knowledge/<slug>/  +  ▶ Supabase (dossiers)
                              (seen-log marca só o RESOLVIDO: dupe/cortado/feito)

═══════════ FASE B · GERAÇÃO ═══════ build_carousel.py + build_platforms.py
  Supervisor de Vendas (Sonnet) ── CASA pauta × PRODUTO afiliado campeão + disclosure CONAR
       └─► lib/affiliates.py ── link real do campeão (Amazon / Mercado Livre / Shopee)
  Carrossel (Sonnet) ── slides + caption + hashtags + 1º comentário
  Avaliador (Haiku) ── quality gate (nota, aprovado?, checagens eliminatórias)
       └─► web/scripts/render_slides.mjs ── 6 slides 1080×1350 NO FRAME  +  ▶ Supabase (pieces)
       │
       ├─ Instagram Publisher (Sonnet) ── legenda BR + EUA + 7 palavras-chave + headlines topo/capa
       ├─ TikTok Publisher (Sonnet) ── viral BR (hook 1s, beats, loop, CTA, áudio)
       ├─ Empacotador (Sonnet) ── YouTube Shorts (título, descrição, tags)
       └─ ARTE (orchestrator/art.py):
            Diretor de Arte (Sonnet) ── brief + protagonista + prompt BJJ-correto (bjj-visual.md)
              ├─ lib/heroimg ── busca a IMAGEM DO ASSUNTO na web (og:image do artigo)
              ├─ lib/imagegen (Gemini/GPT/Runway) ── RECONTEXTUALIZA o assunto → vira o FUNDO
              ├─ Art QC (Haiku 👁) ── reprova judô/íntimo/aberração/não-BJJ → REGERA (loop até 3x)
              ├─ Capa Visão (Haiku 👁) ── escolhe/escreve a headline HONESTA com a imagem
              └─ web/scripts/render_story.mjs --bg ── fundo do assunto + FRAME AlohaBJJ por cima
            (sem chave de imagem → frame teal seguro; nunca reposta foto de terceiro)

═══════════ PUBLICAÇÃO ═══════
  outputs/<slug>/ ──► /admin (VOCÊ aprova) ──► portal + pacotes copiar-e-colar por rede

AO VIVO: lib/jobs ─► jobs/*.jsonl + ▶ Supabase (agent_steps) ─► /admin/agentes (Academia)
```

## 2. Os 14 agentes

| # | Agente | Fase | Modelo | Entrada → Saída | Onde |
|---|---|---|---|---|---|
| 1 | **Voice Distiller** | boot | Opus | acervo → `config/voz.md` | `distill_voice.py` |
| 2 | **Radar** | A | Haiku | RSS (lote) → relevância + corte | `phase_a.radar_filter` |
| 3 | **Dedupe** | A | Haiku+emb | pauta → novo/existe/enriquecer | `orchestrator/dedupe.py` |
| 4 | **Pesquisador** | A | Sonnet+web | pauta → material (≥2 fontes) | `phase_a.process_topic` |
| 5 | **Validador** | A | Sonnet | material → fatos + confiança | `phase_a.process_topic` |
| 6 | **Analista** | A | Opus | tudo → dossiê §9.1 | `phase_a` / `build_dossiers` |
| 7 | **Supervisor de Vendas** | B | Sonnet | dossiê+catálogo → produto+CTA+CONAR | `build_carousel` |
| 8 | **Carrossel** | B | Sonnet | dossiê+brief+voz → slides+caption | `build_carousel` |
| 9 | **Avaliador** | B | Haiku | peça → aprova/rejeita | `build_carousel` |
| 10 | **Instagram Publisher** | B | Sonnet | peça → legenda BR+EUA, headlines | `build_platforms` |
| 11 | **TikTok Publisher** | B | Sonnet | peça → pacote viral BR | `build_platforms` |
| 12 | **Empacotador** | B | Sonnet | peça → YouTube Shorts | `build_platforms` |
| 13 | **Diretor de Arte** | B | Sonnet | dossiê → brief + prompt de imagem | `art.art_brief` |
| 14 | **Art QC** 👁 | B | Haiku | imagem → aprova/reprova (visão) | `art.qc_image` |

Passo extra **Capa Visão** (Haiku 👁, `art.coherent_headline`): dá olhos à escolha da headline pra ela nunca mentir sobre a imagem.

## 3. Módulos de apoio (não são agentes, mas orquestram)
- **`lib/claude.py`** — roteamento Haiku/Sonnet/Opus, **backoff 529**, guard de saída vazia, **suporte a visão** (imagem no `call`), spend cap por run.
- **`lib/affiliates.py`** — Amazon (PA-API) / Mercado Livre / Shopee; pega o link do campeão de vendas. Degrada sem credencial.
- **`lib/heroimg.py`** — busca a imagem relacionada da web (og:image) pra recontextualização.
- **`lib/imagegen.py`** — Gemini/GPT/Runway; geração com **imagem de referência** (likeness-preserving) + custo no teto.
- **`lib/db.py`** — dual-write no Supabase (best-effort, no-op sem chave).
- **`web/scripts/render_*.mjs`** — slides 1080×1350, story 9:16, story-frame com/sem fundo (sharp).

## 4. Guardrails ativos
- **Regra das 2 fontes** (1 fonte → `nao_confirmado`). **Backoff 529** no web_search.
- **seen-log** marca só o resolvido (falha re-tenta). **Radar** corta pauta fraca.
- **Art QC** reprova judô/íntimo/aberração. **Capa Visão** garante headline↔imagem.
- **CONAR**: disclosure #publi pra afiliado; `is_ai_generated` no post. **Nunca** repostar foto de terceiro (só recontextualização/frame próprio).
- **Spend cap** por run (inclui custo de imagem). **Roteamento** de modelo por etapa.

## 5. Casamento conteúdo × produto (novo)
O Supervisor cruza os sinais do dossiê (gi/no-gi, técnica, evento, atleta) com as `tags`/`gatilho` do catálogo:
`No-Gi/ADCC → rashguard-nogi` · `gi/Mundial → gi-competicao` · `leg lock → instrucional-leglock`. Sem link real → `precisa_link:true` (Lucas cola). Afiliado ⇒ disclosure #publi.

## 6. Pendências / próximos (ver `docs/AUDITORIA-CTO.md`)
🔴 prompt caching · Batch API · teto de gasto global · auth do `/admin` · allowed_domains no web_search · resume mid-chain. 🟡 dual-write assíncrono · alertas.

---
*Atualizado 2026-07-16 pós-sessão: Supervisor v3 (afiliado por relevância), pipeline de arte estruturado (Diretor plugado + Art QC + Capa Visão + fundo recontextualizado), IG/TikTok Publishers, dual-write Supabase.*
