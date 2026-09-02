# Plataforma editável — spec das fases 3 a 6

*Spec de design · 02/09/2026 · AlohaBJJ / BjjcomLucas*
*Sucede o spec `2026-09-02-pronto-para-producao-design.md`, cujas fases 1–2 já foram entregues.*

---

## 1. O pedido

Nas palavras do dono:

> *"nosso painel admin devemos conseguir editar tudo do blog, todos conteúdos com opção de visualizar como fica postado, poder mudar o posicionamento dos conteúdos, devemos poder editar cores, logo, layouts dos templates que estamos produzindo… devemos poder editar a plataforma de IA que desejarmos incluindo o token da api etc quero algo totalmente editável sem precisar escrever uma linha de código"*

O objetivo por trás é um só: **ser dono da plataforma sem depender de um desenvolvedor.** Tudo neste spec serve a isso, e o que não serve fica de fora.

O pedido se decompõe em quatro subsistemas de tamanhos muito diferentes:

| Subsistema | Tamanho | Fase |
|---|---|---|
| Configuração que o pipeline lê (fundação de tudo) | médio | 3 |
| CMS de conteúdo — editar, ver como fica, disparar | médio | 4 |
| Tema — cores, logo, fontes, textos fixos | **pequeno** | 5 |
| Layout dos templates de arte | grande | 6 |
| Provedor de IA e token | pequeno de UI, **grande de motor** | 6 |

O tema é o de melhor relação esforço/resultado: é pequeno e entrega a maior parte da sensação de "isso é meu". O layout de template é o oposto.

---

## 2. Estado ao começar

As fases 1–2 já entregaram, e este spec assume:

- **Publicar é ato humano.** O pipeline grava `validated`; o operador promove em `/admin/conteudo`. `lib/porteiro.py` e `web/lib/porteiro.ts` são as duas metades da regra, ambas testadas.
- **`web/lib/server-db.ts`** dá acesso PostgREST server-side com service key. Contrato: `dbSelect` devolve `null` em erro e `[]` quando não achou — quem consome não pode confundir os dois.
- **O Next lê o `.env` da raiz** (`process.loadEnvFile` no `next.config.mjs`). Antes não lia, e por isso a auth do `/admin` nunca esteve ligada localmente.
- **43 testes** (26 pytest + 17 `node --test`). Base pequena mas existe.

E em paralelo a este spec, seis frentes estão fechando: guardrails de custo (teto diário real, cache medido, `allowed_domains`), SEO do portal, cliques no banco, controle editorial (apagar/arquivar/destacar/reordenar/corrigir), remoção do agent-town, e o ciclo diário no GitHub Actions. **Este spec começa depois delas** e não repete nada do que elas cobrem.

---

## 3. Princípio: o que é editável, e o que não é

Nem tudo deve ser editável. A régua:

**É editável** o que muda a cara, a voz ou a economia do produto: texto, título, categoria, ordem, cor, logo, fonte, prompt de agente, fonte de RSS, tag de produto, link de afiliado, modelo de IA, teto de gasto.

**Não é editável pelo painel** o que, se alguém errar, quebra o produto sem sinal: schema do banco, a regra do porteiro, o roteamento de modelo por etapa, o contrato JSON dos agentes. Isso é código, muda por commit, e é assim de propósito.

**A linha das chaves de API** já foi decidida (D3, no spec anterior): chave de provedor sai do banco; configuração de negócio fica. Este spec **revisa essa decisão** — ver §7.

---

## 4. Fase 3 — A fundação: configuração no banco

Sem isto, nenhuma outra fase funciona no deploy: hoje toda edição do painel escreve arquivo em disco, e na Vercel o disco não existe.

### 4.1 Banco

```sql
create table if not exists app_config (
  path         text primary key,          -- 'config/fontes.yaml', 'agents/radar/system.md'
  conteudo     text not null,
  content_hash text,
  updated_at   timestamptz default now(),
  updated_by   text
);

create table if not exists app_settings (
  key        text primary key,            -- SCOUT_MODEL, SPEND_CAP_USD, AMAZON_PARTNER_TAG
  valor      text,
  segredo    boolean default false,       -- true = nunca devolvido pra tela (ver §7)
  updated_at timestamptz default now(),
  updated_by text
);
```

Ambas com RLS ligada e **sem policy para anon**. Só service role lê e escreve.

Sob gestão do `app_config`: `config/catalogo.yaml`, `config/fontes.yaml`, `config/atletas.yaml`, `config/voz.md`, `config/regras.md`, `config/bjj-visual.md`, `config/cursos/*.yaml`, `agents/*/system.md` (23 prompts).

### 4.2 `lib/config_store.py`

```python
read(path: str) -> str          # banco primeiro; vazio → lê arquivo, grava seed, devolve
setting(key: str, default=None) # app_settings → os.environ → default
seed(path: str) -> None         # arquivo → banco, sobrescrevendo (explícito)
diverged() -> list[str]         # paths onde hash(arquivo) != content_hash do banco
```

- Sem credencial de Supabase → tudo cai no arquivo. O fluxo local sem banco continua de pé.
- No início de cada run, `diverged()` roda uma vez e cada path divergente vira aviso no log:
  `[config] agents/radar/system.md difere do banco — o banco está valendo. Use seed_config para empurrar o arquivo.`

### 4.3 Regra de precedência (decisão D2, mantida)

**O banco manda. O arquivo no git é semente.** Para fazer o arquivo valer, roda-se um comando explícito:

```
python -m orchestrator.seed_config --all
python -m orchestrator.seed_config --file config/fontes.yaml
python -m orchestrator.seed_config --diff
```

Nunca automático. O motivo é que a alternativa — "o mais novo ganha" — depende de relógio e produz sobrescrita fantasma no dia em que se edita nos dois lugares na mesma tarde.

### 4.4 Call sites a migrar

Todos passam a chamar `config_store.read`:

| Arquivo | O que lê hoje |
|---|---|
| `orchestrator/phase_a.py` | `_sys()` → `agents/<nome>/system.md` |
| `orchestrator/build_carousel.py` | `catalogo.yaml`, `voz.md` |
| `orchestrator/build_platforms.py` | prompts dos publishers |
| `orchestrator/art.py` | `bjj-visual.md` |
| `orchestrator/enrich_athlete.py` | `atletas.yaml` |
| `orchestrator/build_course.py`, `ideate.py`, `scout_trends.py`, `plan_week.py`, `find_products.py` | prompts |
| `ingestion/rss.py` | `fontes.yaml` |

Lado web: `web/lib/config.ts`, `catalog.ts`, `sources.ts`, `atletas.ts`, `cursos.ts` param de usar `fs` e passam a ler/escrever `app_config` via `server-db.ts`. A função `writeEnvKey` é **removida**.

### 4.5 Uploads da base de conhecimento

Binários vão para o Supabase Storage, bucket **privado** `sources` — hoje o único bucket é o público `art`, e mídia enviada pelo operador não pode morar num bucket público. Índice em tabela `knowledge_sources`; o Python lê pelo índice com URL assinada.

### 4.6 Telas que a fase 3 conserta

- **Fontes do Radar** deixa de ser um textarea de YAML cru (200 linhas, onde um erro de indentação derruba o Radar no dia seguinte) e vira **lista**: nome, feed, prioridade, **liga/desliga**, e um botão **"testar"** que busca o feed e mostra as 3 últimas manchetes antes de salvar. Hoje só se descobre que um feed morreu quando param de chegar pautas.
- **Chaves & config** ganha duas seções: *Configuração* (editável) e *Chaves* (ver §7).

---

## 5. Fase 4 — CMS de conteúdo

### 5.1 Editar o conteúdo, não só os metadados

A fase 5 anterior deu apagar, arquivar, destacar, reordenar e corrigir título/categoria. Falta o corpo:

- **Editar o texto do dossiê** (`summary.md`) num editor de texto simples, com o original preservado. O artefato em disco continua sendo o que o pipeline gerou; a edição vive no banco (`dossiers.resumo_editado`) e vence na hora de renderizar.
- **Editar as tags do dossiê.** Hoje só as tags de *produto* são editáveis. O Supervisor casa pauta × produto cruzando as duas pontas, e a ponta do dossiê é inventada pelo Analista sem recurso — se ele etiqueta uma luta de leg lock como "gi", o produto errado gruda e a única saída é regerar o dossiê por US$ 0,47.
- **Vocabulário de tags.** Texto livre dos dois lados produz `no-gi`, `nogi`, `No-Gi`. O modelo tolera, mas é ruído no casamento e o operador nunca vê a lista do que existe. Um seletor alimentado pelas tags já usadas, com liberdade de criar nova.
- **Trocar a imagem de capa** — upload ou URL.

### 5.2 Ver como fica postado

Duas coisas diferentes, com custos diferentes:

**Prévia do artigo (barata).** Rota `/admin/preview/<slug>` que renderiza o componente REAL do portal com os dados de rascunho, dentro do layout do site. Nada de reimplementar a página — se a prévia usa outro código que a página, ela mente.

**Prévia da arte (cara, e é preciso decidir).** Os PNGs saem de `web/scripts/render_slides.mjs` e `render_story.mjs`, scripts Node com `sharp`. Isso não roda dentro de um Server Component. Três caminhos:
- (a) rodar `sharp` numa Route Handler da Vercel — funciona, `sharp` é suportado, mas é a rota mais lenta e conta no tempo de função;
- (b) enfileirar em `run_queue` (§5.3) e mostrar quando ficar pronto — coerente com o resto, mas prévia que demora não é prévia;
- (c) reimplementar o layout em HTML/CSS só para a prévia — rápido, mas **mente** sobre o resultado final, que é o pecado descrito acima.

**Recomendação: (a)**, aceitando a lentidão, porque prévia que mente é pior que prévia lenta. Reavaliar se o tempo de função incomodar.

### 5.3 Fila de disparo (`run_queue`)

Hoje `/api/run` faz `spawn("python")`. Na Vercel não existe python — o botão "Rodar" é uma tela que nunca acende.

```sql
create table if not exists run_queue (
  id           uuid primary key default gen_random_uuid(),
  task         text not null,                    -- mesma allowlist do buildArgs de hoje
  params       jsonb default '{}'::jsonb,
  status       text default 'pendente',          -- pendente|executando|concluido|falhou
  run_id       text,
  requested_by text,
  requested_at timestamptz default now(),
  started_at   timestamptz, finished_at timestamptz, error text
);
create index if not exists idx_run_queue_pend on run_queue (status, requested_at);
```

- `/api/run` (POST) valida contra a allowlist existente e **enfileira**.
- `orchestrator/worker.py` consome a fila (uma tarefa por vez). `orchestrator/daily.py` drena ao final do ciclo. Roda no PC hoje, no GitHub Actions amanhã, sem tocar no admin.
- O console ao vivo já lê `agent_steps` do banco.

---

## 6. Fase 5 — O tema

**O subsistema de melhor retorno deste spec.** Pequeno, e é o que faz o produto parecer seu.

### 6.1 Um tema, dois consumidores

Hoje a identidade está cravada em três lugares que não conversam: `web/app/globals.css` (tokens do portal), `web/app/(admin)/admin/admin.css` (tokens do painel) e `web/scripts/render_slides.mjs` — este último com a paleta literal na linha 20 (`TEAL`, `RED`, `INK`) e frases como `"SIGA PARA MAIS BJJ"` na linha 80.

Passa a existir **um tema só**, em `app_config` sob o path `config/tema.json`:

```json
{
  "cores":  { "ink": "#0B0B0C", "paper": "#F5F3EF", "red": "#D8232A", "teal": "#1A9CB4" },
  "fontes": { "display": "Anton", "corpo": "Inter" },
  "logo":   { "portal": "<url no Storage>", "arte": "<url no Storage>", "recorte": "<url>" },
  "textos": {
    "ticker": "Cobertura ao vivo · Mundial IBJJF · ADCC…",
    "rodape_arte": "SIGA PARA MAIS BJJ",
    "assinatura": "@bjjcomlucas",
    "dominio_arte": "ALOHABJJNEWS.COM"
  }
}
```

- **Portal**: as variáveis CSS de `globals.css` passam a ser injetadas a partir do tema (um `<style>` no layout, gerado no servidor).
- **Arte**: `render_slides.mjs` e `render_story.mjs` param de ter cor e texto literais e passam a receber o tema como argumento.
- **Painel**: tela `/admin/tema` com seletor de cor, upload de logo e campos de texto, mostrando uma prévia lado a lado — um card do portal e um slide.

### 6.2 O que NÃO entra no tema

Espaçamento, escala de tipo e grid. São decisões de composição; deixá-las editáveis produz layout quebrado sem que ninguém saiba por quê. Se um dia incomodar, entra como *presets* nomeados, nunca como campos soltos.

---

## 7. Fase 6 — Provedor de IA, e o layout dos templates

### 7.1 Chave de API editável — decisão revisada

O spec anterior (D3) tirou as chaves de provedor do painel. **Esta decisão muda**, e vale explicar por quê: o argumento original era contra guardar chave sob uma senha de 10 caracteres sem limite de tentativa. A fase 2 removeu exatamente essa condição — sessão com expiração, secret obrigatório, limite de tentativa e comparação em tempo constante.

Fica **aceitável**, sob duas condições que são parte do escopo, não recomendações:

1. **Campo de escrita, nunca de leitura.** Grava-se a chave; a tela nunca a devolve — mostra `configurada ✓` e a data. É o que a coluna `app_settings.segredo` marca. Entrar no painel deixa de significar levar a chave embora.
2. **Teto diário real, já existente.** Sem chão de gasto, chave vazada ou loop maluco não tem limite. *(Esta condição está sendo entregue em paralelo por outra frente — confirmar antes de liberar o campo.)*

### 7.2 Trocar de provedor de IA — o custo honesto

**Não é um dropdown.** `lib/claude.py` depende de recursos que não são universais:

- `output_config.format` com `json_schema` — é o que garante que os 23 agentes devolvem JSON válido em vez de texto solto. Sem isso, cada agente precisa de parser tolerante e o pipeline passa a quebrar de formas novas.
- `thinking: adaptive` e `effort` — controlam profundidade por etapa e são a base do roteamento de custo.
- Visão — o Art QC e a Capa Visão *olham* a imagem.

O `lib/imagegen.py` já é multi-provedor e funciona porque a interface é trivial: "gere um PNG". Texto é muito mais acoplado.

**Escopo desta fase:**
- **Agora:** dropdown de **modelo dentro da Anthropic**, por etapa (Radar, Pesquisador, Analista, Carrossel…). O roteamento Haiku/Sonnet/Opus já existe em `lib/claude.py`; é expor o que já há, e é a alavanca de custo que o dono realmente vai querer mexer.
- **Depois, como projeto próprio:** adaptador multi-provedor com uma interface `gerar(system, user, schema) -> str`, um adaptador por provedor, e degradação explícita e documentada onde o provedor não garante saída estruturada. Só faz sentido com a suíte de testes maior do que a de hoje.

### 7.3 Layout dos templates de arte

O slide é SVG montado dentro de JavaScript, com coordenadas ajustadas na mão (`LINE_X = 404`, `TX = 448`, tamanhos de fonte por número de linhas). Editar **cor, logo, fonte e texto** já foi resolvido pelo tema (§6) e cobre a maior parte do desejo.

Editar **posição e composição** exige extrair o layout para uma descrição de dados (blocos com âncora, tamanho e ordem) e um editor visual em cima. É a peça mais cara deste spec e a que menos muda o resultado de negócio.

**Recomendação: entregar o tema (§6) e reavaliar.** Se depois de mexer nas cores, no logo e nos textos ainda incomodar a posição, aí sim se paga o editor de layout — com evidência, não por antecipação.

---

## 8. O que continua não sendo editável (e é honesto dizer)

| Item | Por quê |
|---|---|
| Credenciais de afiliado *funcionando* | O campo já existe no `/admin/catalogo`; falta você abrir as contas. Nenhum código resolve. |
| Checkout de curso pago e 3D | Projeto próprio: gateway, pedido, entrega, fiscal. |
| Auto-publicação nas redes | Só faz sentido depois que a distribuição aponta pra link que converte. |
| Schema do banco, regra do porteiro, contrato JSON dos agentes | Se alguém errar, quebra sem sinal. Muda por commit, de propósito. |

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Migrar 8+ call sites de config e quebrar um run | `config_store.read` cai no arquivo quando o banco não responde — o pior caso é o comportamento de hoje. |
| Perder edição do painel ao rodar `seed_config` | O comando é sempre explícito e nunca automático; `--diff` mostra antes. |
| Tema editável produzir combinação ilegível | Contraste mínimo validado no salvamento; prévia lado a lado antes de aplicar. |
| Chave de API no banco | Escrita-only + teto diário real (§7.1). As duas condições são obrigatórias, não recomendações. |
| Prévia de arte lenta na Vercel | Aceito conscientemente (§5.2); a alternativa mente sobre o resultado. |
| DDL manual no Supabase | O MCP não alcança o projeto `bjj`. Todo SQL sai como arquivo idempotente para o SQL Editor. |

---

## 10. Ordem

| Fase | Entrega | Depende de |
|---|---|---|
| **3** | Configuração no banco · `config_store` · `seed_config` · fontes como lista · uploads em bucket privado | as seis frentes em curso terem sido integradas |
| **4** | CMS de conteúdo · prévia do artigo · tags editáveis com vocabulário · `run_queue` + worker | fase 3 |
| **5** | Tema único (portal + arte) · tela `/admin/tema` | fase 3 |
| **6** | Dropdown de modelo por etapa · chave escrita-only · *(reavaliar layout de template)* | fase 3 e o teto diário |

A fase 5 é a que o dono mais vai sentir e a mais barata de fazer. A fase 6 é a que parece maior e entrega menos — o dropdown de modelo é útil, o editor de layout provavelmente não se paga.
