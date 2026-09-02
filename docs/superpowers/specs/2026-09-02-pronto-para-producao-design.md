# Pronto para produção — persistência, porteiro e controle editorial

*Spec de design · 02/09/2026 · AlohaBJJ / BjjcomLucas*

---

## 1. Problema

O projeto vai pro ar na Vercel. Hoje ele não pode ir, por três razões independentes:

**1. O portal publica conteúdo que a própria máquina reprovou.** 9 dos 52 dossiês estão marcados `confianca: baixa`; um deles diz no corpo do texto *"Esta pauta não passou na apuração"*. Todos aparecem no portal como notícia normal. A trava existia — o `schema.sql` só liberava `status = 'published'` pro público — e foi afrouxada na migração de 19/07 para `('validated','published')` a fim de fazer o deploy mostrar conteúdo. O pipeline grava tudo como `validated`.

**2. Tudo que o admin escreve morre no deploy.** Onze superfícies gravam em disco via `process.cwd()/..`, caminho que não existe na Vercel: estado de peça, catálogo, fontes, os 22 prompts, voz/regras, `.env`, atletas, cursos, candidatos de produto, uploads da base de conhecimento e cliques. Falham em silêncio.

**3. Não dá pra editar conteúdo.** O admin edita configuração, mas não o conteúdo em si: não apaga dossiê, não esconde, não corrige título, não troca categoria, não escolhe destaque, não reordena. A home ordena por data. A categoria é adivinhada por um `if` que cai em `superlutas` sempre que há atleta e o WordPress não deu categoria útil — é a causa do desbalanço de editorias.

Some a isso um sintoma correlato: o Trend Scout devolveu como tendência nº 1 *"Food Jutsu (Summoning Hands Jujutsu Kaisen)"* — um meme do anime Jujutsu Kaisen. Não existe gate de nicho no texto, embora exista na imagem (Art QC).

---

## 2. Princípio

O projeto já declara o princípio certo em `lib/db.py`:

> *os arquivos continuam sendo o artefato; o banco é o índice/estado/memória.*

Esta fatia leva esse princípio às últimas consequências:

- **Artefato** (corpo do dossiê, slides, PNG) → arquivo e Storage. Não muda.
- **Estado e configuração** (o que está publicado, qual o título, qual a tag, qual a fonte, qual o prompt) → **banco, sempre**. O arquivo no git passa a ser semente, não verdade.

---

## 3. Decisões tomadas

| # | Decisão | Escolha |
|---|---|---|
| D1 | Onde o pipeline Python roda depois disso | **Indiferente.** O desenho funciona igual no PC e no GitHub Actions. A diferença vira "onde o cron mora", não arquitetura. |
| D2 | Conflito arquivo × banco | **Seed explícito.** O banco manda. Pra fazer o arquivo valer, roda-se um comando. O run avisa no log quando os dois divergem. |
| D3 | Chaves e configuração | **Linha traçada pelo risco.** O que gasta dinheiro na conta de um provedor sai pro ambiente (Vercel/Actions). Configuração de negócio fica editável no admin. |
| D4 | Publicação de conteúdo | **Ato humano.** O pipeline nunca publica. Ele entrega `validated`; quem promove pra `published` é o operador. |
| D5 | Disparo de pipeline pela web | **Fila no banco.** O admin enfileira, um worker consome. Funciona na Vercel sem ter python no servidor. |

---

## 4. Blocos

### Bloco 1 — O porteiro

**Objetivo:** conteúdo não-verificado nunca alcança o público sem decisão humana explícita.

**Banco**
- Política `anon` em `dossiers` volta a `status = 'published'`. (Reverte o afrouxamento da migração `2026-07-19-p0-deploy.sql`.)
- Idem para `pieces` (`estado = 'publicado'`, já está correta) e `platform_packages`.

**Pipeline**
- `build_dossiers.upsert_dossier` continua gravando `status = 'validated'`. Nenhuma mudança.

**Admin**
- Ação `publicarDossie(slug)`: `validated → published`, registrada com autor e horário.
- Ação `despublicarDossie(slug)`: volta pra `validated`.
- **Trava de confiança:** quando `confianca = 'baixa'` **ou** o dossiê carrega qualquer tag de `TAGS_BLOQUEIO`, publicar exige segunda confirmação. A tela mostra o motivo real, extraído do primeiro parágrafo do `summary.md` — no caso da Mariana Bucher, a frase "Esta pauta não passou na apuração".
- **Normalização de tag (importante):** as tags do Analista vêm em texto livre e acentuado — o dossiê do André Galvão traz literalmente `"tema sensível"`, com espaço e acento. A comparação é feita sobre a tag **normalizada** (minúscula, sem acento, espaço → hífen), contra `TAGS_BLOQUEIO = {nao-verificado, apuracao-incompleta, pendente, nao-confirmado, tema-sensivel, rumor}`. Comparar cru deixaria a trava passar batido.
- Os 9 dossiês de confiança baixa entram despublicados. Nada é apagado; a decisão é do operador.

**Leitura do portal**
- Hoje `getDossiers()` é compartilhada entre portal público e admin, e não filtra nada. Passa a ser duas funções com contrato distinto:
  - `listPublic()` — usada por `/`, `/artigo/[slug]`, sitemap. **Nunca lê o disco cru.** Consulta o banco (`status = 'published'`), e cai no snapshot do Storage quando o banco não responde. O snapshot passa a conter só publicados.
  - `listAll()` — usada só pelo `/admin`. Lê o disco/snapshot inteiro e cruza com o estado do banco, para o operador enxergar o que ainda não subiu.
- `sync_to_cloud` filtra por `status = 'published'` antes de escrever `data/dossiers.json`.
- `/artigo/[slug]` de dossiê não publicado devolve 404, inclusive local.

**Trend Scout**
- Novo passo `trend_qc`, no mesmo padrão do `art_qc`: uma chamada Haiku recebe as tendências e reprova as que não são de BJJ/grappling, com motivo. Reprovada não entra no `latest.json`. O run loga quantas foram cortadas.
- Prompt novo em `agents/trend_qc/system.md`.

---

### Bloco 2 — Persistência de configuração

**Banco**

```sql
create table if not exists app_config (
  path         text primary key,          -- 'config/fontes.yaml', 'agents/radar/system.md'
  conteudo     text not null,
  content_hash text,
  updated_at   timestamptz default now(),
  updated_by   text
);

create table if not exists app_settings (
  key        text primary key,            -- SPEND_CAP_USD, SCOUT_MODEL, AMAZON_PARTNER_TAG
  value      text,
  updated_at timestamptz default now(),
  updated_by text
);
```

Ambas com RLS ligada e **sem policy pra anon** — só service role lê e escreve.

**Arquivos sob gestão do `app_config`:** `config/catalogo.yaml`, `config/fontes.yaml`, `config/atletas.yaml`, `config/voz.md`, `config/regras.md`, `config/bjj-visual.md`, `config/cursos/*.yaml`, `agents/*/system.md`.

**Módulo novo: `lib/config_store.py`**

```python
read(path: str) -> str          # banco primeiro; se vazio, lê o arquivo, grava como seed e devolve
setting(key: str, default=None) # app_settings → os.environ → default
seed(path: str) -> None         # arquivo → banco, sobrescrevendo (explícito)
diverged() -> list[str]         # paths onde hash(arquivo) != content_hash do banco
```

- Sem `SUPABASE_URL`/`SERVICE_ROLE_KEY` → tudo cai no arquivo. O fluxo local sem banco continua funcionando.
- No início de cada run, `diverged()` é chamado uma vez e cada path divergente vira uma linha de aviso no log: `[config] agents/radar/system.md difere do banco — o banco está valendo. Use seed_config para empurrar o arquivo.`

**Comando novo: `orchestrator/seed_config.py`**

```
python -m orchestrator.seed_config --all
python -m orchestrator.seed_config --file config/fontes.yaml
python -m orchestrator.seed_config --diff        # só mostra o que difere
```

**Call sites a migrar** (passam a chamar `config_store.read`):

| Arquivo | Hoje |
|---|---|
| `orchestrator/phase_a.py` | `_sys()` lê `agents/<nome>/system.md` |
| `orchestrator/build_carousel.py` | `catalogo.yaml`, `voz.md` |
| `orchestrator/build_platforms.py` | prompts dos publishers |
| `orchestrator/art.py` | `bjj-visual.md` |
| `orchestrator/enrich_athlete.py` | `atletas.yaml` |
| `orchestrator/build_course.py`, `ideate.py`, `scout_trends.py`, `plan_week.py`, `find_products.py` | prompts |
| `ingestion/rss.py` | `fontes.yaml` |

**Lado web:** `web/lib/config.ts`, `catalog.ts`, `sources.ts`, `atletas.ts`, `cursos.ts` param de usar `fs` e passam a ler/escrever `app_config` via service key, num módulo novo `web/lib/server-db.ts` (server-only; a service key **nunca** recebe prefixo `NEXT_PUBLIC_`).

**Chaves (D3)**

| Vai para o ambiente (Vercel + Actions) | Fica editável no admin (`app_settings`) |
|---|---|
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `RUNWAYML_API_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | `SPEND_CAP_USD`, `DAILY_SPEND_CAP_USD`, `SCOUT_MODEL`, `IMAGE_PROVIDER_ORDER`, `AFFILIATE_ORDER`, `RADAR_MAX_AGE_DAYS`, `AMAZON_*`, `ML_*`, `SHOPEE_*`, `PORTAL_URL` |

`/admin/config` passa a ter duas seções: **"Configuração"** (editável) e **"Chaves"** (só leitura — mostra setada/faltando e onde configurar). `writeEnvKey` é removida.

**Uploads da base de conhecimento**
- Binários vão pro Supabase Storage, bucket **privado** `sources` (hoje o único bucket é o público `art` — mídia enviada pelo operador não vai pra um bucket público).
- Índice em tabela `knowledge_sources` (id, tipo, título, notas, tags, agentes, url, atleta, storage_path, created_at).
- O Python lê pelo índice + URL assinada.

---

### Bloco 3 — Controle editorial

**Banco**

```sql
alter table dossiers add column if not exists destaque  boolean default false;
alter table dossiers add column if not exists ordem     int;
alter table dossiers add column if not exists arquivado boolean default false;
```

`titulo` e `categoria` já existem como colunas — passam a ser editáveis e a **vencer** sobre o valor inferido do arquivo.

**Categoria deixa de ser adivinhada.** A função `mapCategoria` (o `if` que joga tudo em `superlutas`) continua existindo, mas só como **sugestão inicial** gravada uma vez na criação do dossiê. Depois disso, quem manda é a coluna. É o que desempilha as editorias.

**Admin — tela nova `/admin/conteudo`**

Lista todos os dossiês, publicados e não, com:

| Ação | Efeito |
|---|---|
| Publicar / Despublicar | `status` ↔ `published`, com a trava de confiança do Bloco 1 |
| Arquivar | `arquivado = true` — some do admin e do portal, não apaga o arquivo |
| Apagar | remove a linha do banco, o diretório `knowledge/<slug>/`, o `knowledge/_backfill/<slug>.json` (quando existe) e o hero em `web/public/hero/`. Confirmação por digitação do slug. Na Vercel, onde não há disco, apaga só o registro e o Storage — o arquivo cai no próximo `seed`/sync. |
| Destacar | `destaque = true` — é o card grande da home |
| Reordenar | `ordem` (menor primeiro); nulo cai pra ordenação por data |
| Corrigir | título e categoria, inline |

Filtros por editoria, confiança e estado. A tela responde à pergunta que hoje não tem resposta: *"o que está no ar agora?"*

**Estado de peça**
- Sai de `outputs/<slug>/meta.json` e vai para `pieces.estado` + `piece_state_transitions` (tabela que já existe e nunca foi usada).
- `setEstado()` passa a escrever no banco. O `meta.json` continua sendo gravado pelo pipeline como artefato, mas **deixa de ser a verdade do estado**.

---

### Bloco 4 — Cliques e disparo de pipeline

**Cliques**
- `/r/[slug]`, `/k/[palavra]` e `/p/[id]` param de usar `appendFileSync` e inserem em `events` via service key. Best-effort: falha de banco **nunca** bloqueia o redirect.
- `web/lib/tracking.ts` (painel de conversão) passa a agregar do banco.
- `lib/tracking.py` (memória do Supervisor) passa a ler do banco.

**Armadilha conhecida, tratada aqui:** `events.product_id` tem FK para `products(id)`, e `products` está vazia. É exatamente a classe de bug que já queimou o projeto uma vez — a FK de `pieces.produto_id` engolia gravação em silêncio por dias. `product_id` em `events` é a categoria do catálogo (`gi-competicao`), não um id de loja. **A FK cai**, pelo mesmo motivo e com o mesmo raciocínio da migração de 19/07.

**Disparo (D5)**

```sql
create table if not exists run_queue (
  id           uuid primary key default gen_random_uuid(),
  task         text not null,                    -- allowlist idêntica ao buildArgs de hoje
  params       jsonb default '{}'::jsonb,
  status       text default 'pendente',          -- pendente|executando|concluido|falhou
  run_id       text,                             -- liga a agent_runs quando o worker pega
  requested_by text,
  requested_at timestamptz default now(),
  started_at   timestamptz, finished_at timestamptz, error text
);
create index if not exists idx_run_queue_pend on run_queue (status, requested_at);
```

- `/api/run` (POST) valida contra a mesma allowlist de tarefas de hoje e **enfileira**. Não spawna nada.
- Novo `orchestrator/worker.py`: consome a fila (uma tarefa por vez, marca `executando`, executa, marca resultado). `orchestrator/daily.py` drena a fila ao final do ciclo. Roda no PC hoje, no Actions amanhã, sem tocar no admin.
- O console ao vivo (`/api/run` GET) para de ler `jobs/run-*.log` e passa a ler `agent_steps` do banco — que o pipeline já escreve desde julho.
- `/api/agents/activity` idem: sai do varrimento de todos os `jobs/*.jsonl` a cada 2s e passa a consultar `agent_steps` por janela de tempo.

---

### Bloco 5 — Higiene de deploy

**Auth**
- `ADMIN_SESSION_SECRET` obrigatório em produção: sem ele, o app **falha ao subir** em vez de silenciosamente usar a senha como chave.
- Cookie passa a carregar expiração: HMAC sobre `"aloha-admin-session-v1|<exp>"`, e o middleware rejeita expirado. Hoje o token é constante e vale pra sempre.
- Limite de tentativa no login: tabela `login_attempts` (ip_hash, janela, contagem). Contador em memória não serve — cada instância serverless teria o seu.
- Comparação de senha em tempo constante.

**RLS**
- Ligar nas tabelas hoje descobertas, sem policy pra anon: `agent_runs`, `agent_steps`, `events`, `athletes`, `sources`, `source_candidates`, `topics`, `ingested_urls`, `dossier_facts`, `dossier_angles`, `dossier_athletes`, `dossier_tags`, `art_assets`, `piece_state_transitions`, `app_config`, `app_settings`, `run_queue`, `knowledge_sources`, `login_attempts`.
- Rodar o advisor de segurança do projeto e anexar o resultado ao PR.

**Portal**
- CTA do curso: `href="/"` → `/curso` (`web/app/(site)/page.tsx:82`).
- `app/sitemap.ts` e `app/robots.ts` — só dossiês publicados.
- `openGraph` + `twitter` com imagem por artigo, e `metadataBase` a partir de `PORTAL_URL`.
- Paginação na home: 12 por editoria + "ver mais". Hoje lista os 52 inteiros.
- `_cache` de `dossiers.ts` ganha TTL — hoje é módulo-level sem expiração, e no Fluid Compute o conteúdo novo não aparece até a instância reciclar.

---

## 5. Testes

O projeto tem zero teste hoje. Esta fatia **não** cria suíte completa — cria a base dos dois lados e cobre as regras onde falha é silenciosa e cara.

O porteiro tem duas metades em linguagens diferentes, e as duas precisam de teste: a decisão de publicar é aplicada no Python (`sync_to_cloud`, que monta o snapshot) e no TypeScript (`listPublic`, que serve o portal). Testar só uma deixa a outra livre para vazar.

**Python — `pytest` + `requirements-dev.txt`**

`tests/test_porteiro.py`
- `sync_to_cloud` não escreve dossiê não-publicado no snapshot.
- Dossiê `validated` sem promoção humana fica de fora.
- Tag de bloqueio é detectada **depois de normalizada** (`"tema sensível"` casa com `tema-sensivel`).

`tests/test_config_store.py`
- Banco vazio → lê arquivo, grava seed, devolve o conteúdo do arquivo.
- Banco preenchido e diferente do arquivo → devolve o do banco.
- `seed()` sobrescreve o banco com o arquivo.
- `diverged()` aponta exatamente os paths diferentes.
- Sem credencial de Supabase → cai no arquivo, sem levantar.

**TypeScript — `node:test`** (embutido no Node 22, nenhuma dependência nova; roda com `node --test`)

`web/lib/__tests__/porteiro.test.ts` — sobre uma função pura `podeIrAoAr(dossie)` extraída de `listPublic`:
- `status != 'published'` → fora.
- `arquivado` → fora.
- Banco indisponível → o portal cai no snapshot, que já vem filtrado; nunca no disco cru.
- **Falhar fechado é a regra:** todo caminho de erro resulta em *menos* conteúdo público, nunca mais. Este é o modo de falha inaceitável e é o que o teste protege.

---

## 6. Fora de escopo (e por quê)

| Item | Por quê |
|---|---|
| Credenciais de afiliado | Depende de você abrir as contas. O código já degrada sem elas. |
| Checkout de curso pago e 3D | Projeto próprio — gateway, pedido, entrega. |
| Auto-publicação nas redes | Só faz sentido depois que a distribuição aponta pra link que converte. |
| Telas novas de tag e de fonte | Você pediu explicitamente para depois desta fatia. |
| Batch API e medição de cache | Economia, não bloqueia o deploy. |
| Aposentar o `agent-town` | 9.802 linhas de peso morto, mas remover não destrava nada agora. |

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| O porteiro falhar **aberto** e vazar não-verificado | Teste dedicado; a regra de fallback é sempre restritiva; `sync_to_cloud` filtra na origem. |
| Migrar 8 call sites de config e quebrar um run | `config_store.read` cai no arquivo quando o banco não responde — o pior caso é o comportamento de hoje. |
| DDL no Supabase é manual | O MCP do ambiente não alcança o projeto `bjj`. Todo SQL sai como arquivo de migração pra colar no SQL Editor, idempotente, como já foi feito em julho. |
| FK de `events.product_id` engolir gravação | Tratada explicitamente no Bloco 4 — a FK cai antes da primeira escrita. |
| Perder edição feita no admin ao rodar `seed_config` | O comando é sempre explícito e nunca roda sozinho; `--diff` mostra antes. |

---

## 8. Ordem de execução

A fatia é grande, então cada fase precisa **fechar sozinha** — o repositório fica deployável ao fim de cada uma, e você pode parar em qualquer ponto sem deixar o sistema pela metade.

| Fase | Entrega | Deployável ao fim? |
|---|---|---|
| **1** | Bloco 1 — porteiro + `trend_qc` | **Sim.** É a fase que torna o deploy seguro; se só ela sair, já dá pra ir ao ar. |
| **2** | Bloco 5, parte segurança — `ADMIN_SESSION_SECRET`, expiração de cookie, limite de tentativa, RLS | Sim. Precede qualquer exposição do `/admin`. |
| **3** | Bloco 2 — `app_config`, `app_settings`, `config_store`, `seed_config`, migração dos 8 call sites | Sim. Local continua funcionando com ou sem banco. |
| **4** | Bloco 4 — cliques em `events`, queda da FK, `run_queue`, worker, console lendo `agent_steps` | Sim. |
| **5** | Bloco 3 — controle editorial e `/admin/conteudo` | Sim. Depende da fase 3 (estado no banco). |
| **6** | Bloco 5, parte portal — CTA, sitemap, robots, OG, paginação, TTL de cache | Sim. |

A ordem não é negociável em dois pontos: **1 antes de tudo** (é o único risco de marca) e **2 antes de expor o admin**. O resto pode ser reordenado se aparecer motivo.
