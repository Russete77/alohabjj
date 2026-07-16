# BjjcomLucas AI Platform

Plataforma que transforma acontecimentos do BJJ em **dossiês permanentes** (base de conhecimento PT-BR) e reusa cada dossiê para gerar conteúdo multi-formato. Princípio: *pesquisar/validar 1x, gerar N vezes.*

Marca: **AlohaBJJNews / @bjjcomlucas**. PRD completo em [`docs/PRD-BjjcomLucas-v5.md`](docs/PRD-BjjcomLucas-v5.md).

## Estado atual — Fatia 1 (Fase 0: Bootstrap)

Faz a base **nascer cheia** com o acervo do AlohaBJJNews e a voz da marca destilada.
Spec: [`docs/superpowers/specs/2026-07-16-fase0-bootstrap-design.md`](docs/superpowers/specs/2026-07-16-fase0-bootstrap-design.md).

## Setup

```bash
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # preencha ANTHROPIC_API_KEY quando for rodar 3-4
```

## Executar

```bash
# Etapa 2 — import do Aloha (GRÁTIS, sem chave):
python -m ingestion.wp_backfill                 # 43 posts -> knowledge/_backfill/

# Etapas 3-4 — precisam de ANTHROPIC_API_KEY com billing:
python -m orchestrator.distill_voice            # -> config/voz.md
python -m orchestrator.build_dossiers           # -> knowledge/<slug>/*
```

Todo comando é idempotente/resumível e registra token+custo em `jobs/<run_id>.jsonl`.

## Estrutura

```
config/       empresa/voz/regras.md · fontes.yaml · catalogo.yaml
knowledge/    _backfill/ (raw) + <slug>/ (dossiês)
agents/       system.md versionados (analyst, voice_distiller)
ingestion/    wp_backfill · html_clean · resolve_channels
orchestrator/ distill_voice · build_dossiers
lib/          jobs (observabilidade) · claude (cliente + spend cap)
jobs/         <run_id>.jsonl
docs/         PRD + specs
```

## Roadmap (PRD §21)

- **Fase 0 (atual):** bootstrap — base cheia.
- **Fase 1:** Radar→Dedupe→Pesquisador→Validador→Analista + geração de carrossel + painel + tracking.
- **Fase 2:** short-form + YouTube + visualização.
- **Fase 3:** publicação automática (API unificada) + Postgres.
