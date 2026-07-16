# Adendo de spec — Módulo Portal Público (extensão do PRD v5)

**Data:** 2026-07-16 · **Estende:** PRD v5.0 · **Decisão do usuário:** reconstruir o AlohaBJJ como portal próprio dentro deste projeto; o painel vira CMS; o WordPress é aposentado aos poucos.

---

## 1. Por que isto estende o PRD

O PRD v5 tratava o AlohaBJJ como **fonte** (backfill via WP REST, §14) e como **destino de auto-post** só na Fase 3 (§21: "WordPress auto"). O site em si permanecia no WordPress. Este adendo adiciona um **módulo novo — o Portal Público** — um site de notícias/análises de BJJ, próprio, servido por este projeto, alimentado pelos dossiês e artigos gerados. É uma expansão consciente do escopo, decidida em 16/07/2026.

## 2. Arquitetura estendida

```
┌─────────────────────────────────────────────────────────┐
│  PORTAL PÚBLICO (Next.js / Vercel)  — a cara nova         │
│  lê knowledge/ (dossiês) + artigos publicados             │
│  home · categorias · artigo · curso · SEO/SSR             │
└───────────────▲─────────────────────────────────────────┘
                │ publica (aprovado no painel)
┌───────────────┴─────────────────────────────────────────┐
│  PAINEL / CMS INTERNO (mesmo app Next.js, rotas /admin)   │
│  aprova peças · edita · publica no portal · tracking      │
└───────────────▲─────────────────────────────────────────┘
                │ gera
┌───────────────┴─────────────────────────────────────────┐
│  PIPELINE FASE A/B (Python — já existe)                    │
│  Radar→Analista→dossiê · geração de carrossel + artigo    │
└──────────────────────────────────────────────────────────┘
```

**Aposentadoria do WordPress:** o portal novo assume o público gradualmente. O acervo já foi migrado (43 dossiês). Redirecionar domínio/SEO fica para uma fatia futura de migração; até lá, o WordPress atual segue no ar.

## 3. Stack (decisão)

- **Portal + CMS:** Next.js 15 (App Router, TypeScript) na **Vercel** — SSR/SSG e SEO importam num portal de notícias (o React+Vite do PRD §15 servia um painel interno; para um site público, Next.js é o certo). Um único app hospeda o portal (rotas públicas) e o CMS (rotas `/admin`).
- **Estilo:** CSS Globals + tokens da marca (preto/branco/cinza/vermelho + secundárias por teoria de cores — ver protótipo aprovado). Sem framework de UI pesado no MVP.
- **Dados (MVP):** o portal lê o repositório de arquivos direto — `knowledge/<slug>/` (dossiês) + `knowledge/_backfill/<slug>.json` (categoria WP, imagem, data, URL) — em build/SSG. Migra para Postgres na Fase 3 (§15 do PRD), sem mudar a interface de leitura.
- **Publicação:** estado da peça (`gerado → aprovado → publicado`) governa o que aparece no portal. No MVP, "publicar" marca o dossiê como publicado (flag em arquivo); depois vira escrita no banco.

## 4. Modelo de conteúdo do portal

- **Categorias** (das categorias reais do WP no `_backfill`): Superlutas, Notícias, Análises, Técnica.
- **Artigo** = dossiê renderizado: título, categoria, autor (@bjjcomlucas), data, corpo (do `summary.md`), CTA do curso, relacionados, assinatura de fecho.
- **Home:** destaque (hero) + últimas por categoria + banda do curso.
- **SEO:** metadados por artigo (title/description/OG), slug limpo, sitemap.

## 5. Fatias de build (incremental)

1. **Portal MVP (esta fatia):** Next.js + tokens + camada de dados lendo os 43 dossiês reais → home + página de artigo funcionando localmente.
2. **CMS mínimo:** rotas `/admin` — lista de peças, tela de aprovação, ação "publicar no portal" (flag).
3. **Geração de artigo long-form** no pipeline Python (Fase B) alimentando o portal.
4. **Publisher + tracking + Postgres** (Fase 3 do PRD): auto-post IG/TikTok/YT, migração de storage, redirecionamento de domínio.

## 6. Requisitos que continuam valendo (do PRD)

- Compliance CONAR na caption/artigo (§12); flag `is_ai_generated` (§13).
- Regra das 2 fontes e confiança nos dossiês (§7).
- Voz da marca (`config/voz.md`) em todo texto público.
- Observabilidade de custo (§9.3) no pipeline.

## 7. Critérios de aceite da Fatia 1 (Portal MVP)

- [ ] `web/` roda (`next dev`) e faz build (`next build`) sem erro.
- [ ] Home lê os **43 dossiês reais** de `knowledge/` e lista por categoria real.
- [ ] Página de artigo renderiza o dossiê (título, corpo do summary, CTA curso, assinatura).
- [ ] Paleta da marca aplicada (preto/branco/cinza/vermelho); light + dark.
- [ ] Sem `process.env` vazando no client; sem dados inventados (só o que está na base).
