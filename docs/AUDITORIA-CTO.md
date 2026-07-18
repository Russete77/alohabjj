# 🥋 Auditoria de CTO — Ecossistema AlohaBJJ
*Revisão completa do estado atual vs. a visão de "máquina de vendas do BJJ". — 17/07/2026*

---

## 1. A visão (o que estamos construindo)

Um **ecossistema interligado** que transforma notícia de BJJ em venda:

```
FONTES (RSS/web/YouTube)
      │
      ▼
  RADAR + DOSSIÊ (inteligência)
      │
      ├──► PORTAL público de notícias  ──┐
      │                                   │  (linka)
      ├──► INSTAGRAM  (notícias)          │
      ├──► TIKTOK     (notícia+curiosidade+humor)
      ├──► YOUTUBE    (shorts + vídeo longo)
      │        │
      │        ▼  CTA comment-to-DM (ManyChat)
      │        │
      └──►  LOJA  ◄──────────────────────┘
           ├─ Cursos digitais (nossos)
           ├─ Impressão 3D (nossos)
           └─ Afiliados campeões (Shopee/ML/Amazon)
                    │
                    ▼
              VENDA + TRACKING ──► Supervisor APRENDE o que converte
```

**Regra de ouro:** tudo interligado, tudo fácil de mexer e entender, e cada peça de conteúdo empurra pra uma venda.

---

## 2. Veredito executivo (a real)

| | |
|---|---|
| 🟢 **Motor de conteúdo** | **Forte.** Pipeline Fase A→B roda ponta a ponta, com frescor, arte com foto real (grátis) e tracking. |
| 🟡 **Operação (admin)** | **Confuso.** 8 seções sem hierarquia. Precisa reorganizar em blocos claros. |
| 🔴 **Camada de vendas (loja + agentes de produto)** | **Não existe.** É o maior buraco pro "máquina de vendas". |
| 🟡 **Infra (banco, billing, deploy)** | **Meio-caminho.** Schema pronto mas Supabase não ligado; IA/texto travada em billing. |

**Resumo:** temos um ótimo *jornal automatizado*. Falta virar *loja automatizada*.

---

## 3. Estado por camada (honesto, item a item)

| Camada | O que existe | Funciona? | Gap / risco |
|---|---|---|---|
| **Ingestão (Radar/Fase A)** | RSS multi-fonte + dedupe + **filtro de frescor** (só últimos 21 dias) | ✅ | — |
| **Inteligência (dossiê)** | Pesquisador→Validador→Analista (Opus) | ✅ (com chave) | billing IA |
| **Geração (Fase B)** | Supervisor→Carrossel→Avaliador | ✅ | billing IA |
| **Arte / imagem** | **Foto real da web tratada (sharp, grátis)** + frame; feed 1080×1350; **9:16 Stories/Reels**; recorte do Lucas corrigido | ✅ | IA-gen opcional (billing) |
| **Portal público** | Next.js, 4 categorias, **agora com imagem real** em toda notícia | ✅ | deploy das imagens (runtime) |
| **Admin / CMS** | Fila, conversão, catálogo, base de conhecimento, fontes, prompts, chaves, **auth por senha** | ⚠️ funciona mas **confuso** | reorganizar |
| **Tracking / conversão** | `/r` e `/k` gravam clique; painel `/admin/conversao`; Supervisor aprende | ✅ | migrar pro banco |
| **Afiliados** | **3 providers codados**: Amazon (PA-API), Mercado Livre, Shopee + `best_product()` | ⚠️ | **sem credenciais** → link cai no portal |
| **Funil ManyChat** | link estável `/k/<PALAVRA>` → produto → afiliado | ✅ (código) | criar os fluxos 1× no ManyChat |
| **Base de conhecimento** | upload img/voz/vídeo/texto/link que alimenta os agentes | ✅ | — |
| **Loja pública** | — | ❌ | **não existe** |
| **Modelo de produto 3-tipos** (curso/3D/afiliado) | catálogo só tem `proprio`/`afiliado` | ⚠️ | estender |
| **Agentes de produto** | — | ❌ | **não existe** |
| **Banco (Supabase)** | `db/schema.sql` completo (dossiers, pieces, events, agent_steps, RLS) | ⚠️ | **não conectado** (`db.py` é no-op) |
| **Plataformas** | pacotes IG/TikTok/YT (copiar-colar) | ✅ | **auto-post ❌** (manual) |
| **YouTube** | metadados de Shorts | ⚠️ | falta **ideias de vídeo longo** |
| **TikTok** | roteiro de notícia | ⚠️ | falta **curiosidade/humor** |
| **Interligação (ecossistema)** | conteúdo→CTA→ManyChat parcial | ⚠️ | conteúdo↔loja↔canais |

---

## 4. Dívida técnica & riscos (o que me tira o sono como CTO)

1. **Billing de IA** — sem chave Anthropic, os agentes de texto não rodam ao vivo. *(A arte já contorna com foto real tratada — grátis.)*
2. **Supabase não conectado** — schema existe, mas o app não escreve/lê. Sem isso não há loja, pedidos, nem memória durável de conversão.
3. **Admin sem auth ligada** — a senha existe mas está vazia. **Não expor o /admin publicamente antes de setar `ADMIN_PASSWORD`** (ele edita chaves reais).
4. **Imagens do portal em runtime** — capas em `web/public/hero/` (gitignored). No deploy, regenerar (`backfill_images`) ou mover pro Storage.
5. **Afiliados sem credenciais** — todo `/k` e `/r` cai no portal em vez de converter. Falta só cadastrar as creds.
6. **Uso de foto-fonte na arte** — a arte usa a `og:image` do artigo tratada sob o nosso frame (decisão sua, com atribuição registrada). Onde der, migrar pra foto **própria/licenciada** reduz risco de direito autoral. *(No portal, as capas vêm do próprio alohabjjnews.com — sem risco.)*
7. **Publicação manual** — não há auto-post; é copiar-e-colar. OK pra V1, gargalo de escala.
8. **Catálogo em YAML vs banco** — quando a loja for pro Supabase, o Supervisor precisa passar a ler produtos do banco (hoje lê `catalogo.yaml`).

---

## 5. Gaps vs. o ecossistema (o que falta CONSTRUIR)

- 🏪 **Loja pública** — página que lista cursos digitais + 3D + afiliados, cada um com botão de compra/redirect.
- 🧩 **Modelo de produto 3-tipos** — `curso` · `impressao_3d` · `afiliado`, cada um com seu fluxo de compra.
- 🤖 **Agentes de produto especializados** — identificar campeões nos marketplaces → classificar → gerar conteúdo + imagem de conversão → publicar na loja com link de afiliado.
- 🎛️ **Admin claro** — reorganizar em **Conteúdo / Loja / Agentes / Config** (hoje 8 abas sem hierarquia).
- 🔗 **Interligação** — CTA de conteúdo → loja; papéis distintos por canal; tracking unificado no banco.
- 📺 **YouTube longo** — agente de ideias/roteiro de vídeo de canal (hoje só Shorts).
- 😂 **TikTok humor/curiosidade** — trilha além de notícia.

---

## 6. Os papéis de cada canal (a máquina, destrinchada)

| Canal | Papel | Estado |
|---|---|---|
| **Instagram** | Notícias (carrossel feed + stories 9:16) | ✅ pacote pronto |
| **TikTok** | Notícia + novidade + **curiosidade + humor** | ⚠️ só notícia |
| **YouTube** | **Shorts + vídeos longos** | ⚠️ só metadados de Shorts |
| **Portal** | Hub de notícias, linka IG/TikTok | ✅ (agora com imagem) |
| **Loja** | Cursos digitais + 3D + afiliados | ❌ |
| **ManyChat** | Captura o lead do comentário → DM com link | ✅ (código) / criar fluxos |
| **Tracking** | Fecha o loop: clique/venda → Supervisor aprende | ✅ |

---

## 7. Roadmap priorizado (sub-projetos → ordem → dependência)

```
FASE 0 — Hotfixes  ...................................... ✅ FEITO
  ✓ Frescor (só notícia recente)
  ✓ Imagens reais no portal (45 notícias)
  ✓ Arte com foto real tratada (grátis) + 9:16 + recorte do Lucas

FASE 1 — Banco Supabase COMPLETO  ...................... ⏭️ PRÓXIMO
  → 1 SQL completo (projeto todo + loja) pra colar no projeto novo
  → liga o app ao banco (creds no .env)
  Destrava: loja, pedidos, memória durável, interligação

FASE 2 — Modelo de Produto + LOJA pública
  → produtos 3-tipos (curso/3D/afiliado) + página /loja com redirect
  Depende de: Fase 1

FASE 3 — Agentes de Produto
  → identificar → classificar → conteúdo+imagem → publica na loja
  Depende de: Fase 2

FASE 4 — Admin claro (reorganização)
  → Conteúdo / Loja / Agentes / Config
  Pode rodar em paralelo à Fase 2/3

FASE 5 — Interligação + canais
  → CTA conteúdo→loja, TikTok humor, YouTube longo, tracking unificado

FASE 6 — Auto-post (opcional, escala)
  → publicar direto nas APIs (Meta/TikTok/YT) via interface única
```

**Cada fase = seu próprio spec → aprovação → build.**

---

## 8. Decisões que dependem de VOCÊ (externas, não são código)

| Decisão | Por quê | Status |
|---|---|---|
| **Chave/crédito Anthropic** | rodar os agentes ao vivo | pendente |
| **Crédito de imagem** (OpenAI/Gemini/Runway) | só se quiser IA-gen; a arte já funciona com foto real | opcional |
| **Credenciais de afiliado** (Amazon/ML/Shopee) | `/k` e `/r` virarem venda | pendente |
| **Supabase** | colar o SQL + creds no `.env` | projeto criado ✅ |
| **Gateway de pagamento** (curso pago / 3D) | checkout dos produtos próprios | a definir |
| **Fluxos ManyChat** (8 palavras) | funil comment-to-DM | pendente |
| **`ADMIN_PASSWORD`** | ligar auth antes de expor o admin | pendente |

---

## 9. O que foi entregue nesta sprint (rastro)

- Painel de conversão (`/admin/conversao`) + **auth do admin**.
- Editores no admin: catálogo/afiliados, fontes RSS, **base de conhecimento** (upload que alimenta a IA).
- Funil ManyChat estável (`/k/<PALAVRA>`).
- **Arte com foto real tratada** (sharp, grátis) — parou de gastar IA à toa; recorte do Lucas corrigido; **Stories/Reels 9:16**; slides do carrossel com foto de fundo.
- **Frescor**: Radar só puxa notícia recente.
- **Imagens reais** em todas as notícias do portal.

---

## 10. Dívida técnica do pipeline (carry-forward do audit técnico anterior)

**Fechados nesta sprint:** auth do `/admin` (era P0), Diretor de Arte plugado na arte (era P2), imagem foto-first no portal e na arte (era o maior "tell" de design).

**Ainda abertos** (não bloqueiam o ecossistema, mas entram no hardening):
- Teto de gasto **global/diário** (hoje é por-run) + custo de imagem no teto.
- **Resume mid-chain** (Analista falha → re-cobra Pesquisador+Validador).
- `web_search` com **`allowed_domains`** (allowlist imposta, não só documentada).
- **Disclosure CONAR determinístico** (falhar build sem `#publi` quando obrigatório).
- **Alerta** em run desatendido que falha.
- **Prompt caching** + Batch API (maior alavanca de custo).
- Backup de `knowledge/`+`outputs/` + escrita atômica do seen-log.

---

## 11. Recomendação do CTO (resumo de 3 linhas)

1. **Ligar o Supabase (Fase 1)** é o desbloqueio de maior alavancagem — sem banco não há loja nem ecossistema conectado.
2. **Loja + agentes de produto (Fases 2–3)** é onde o dinheiro passa a entrar de verdade.
3. **Admin claro (Fase 4)** em paralelo, pra você operar sem dor.

*O motor é bom. Agora a gente pluga a loja nele e liga a máquina.*
