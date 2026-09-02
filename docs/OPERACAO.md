# Operação — o que roda sozinho, e o que fazer quando não roda

Este documento é para **quem opera o produto**, não para quem programa. Ele explica o que
a máquina faz sozinha todo dia, onde olhar quando algo dá errado e o que precisa estar
cadastrado para tudo funcionar.

---

## 1. O que roda sozinho

**Todo dia, às 06:00 de Brasília** (09:00 UTC), o GitHub executa o ciclo diário:

| Ordem | Passo | O que faz |
|-------|-------|-----------|
| 1 | **Fase A** | Varre as fontes, pega notícia nova e transforma em dossiê |
| 2 | **Trend Scout** | Atualiza o que está bombando no BJJ |
| 3 | **Estrategista** | Replaneja o calendário editorial da semana com o que chegou |
| 4 | **Publica snapshot** | Sobe o estado atual pro Storage, para o portal ler |

Cada passo é independente: se um falhar, os outros ainda tentam. No fim, o ciclo diz
`fase_a=ok · trends=ok · plano=FALHOU · deploy=ok` — e se **qualquer** um falhou, o run
inteiro é marcado como falha (e você é avisado, ver seção 3).

> **Publicação continua sendo ato humano.** O ciclo diário só produz e planeja. Nada vai
> para rede social sozinho — isso segue manual, pelo `/admin`.

### O commit diário do robô

Depois de rodar, o ciclo **faz um commit no repositório** chamado
`ciclo diario: dossies, tendencias e calendario (AAAA-MM-DD)`, assinado por
`github-actions[bot]`.

Isso não é enfeite: **é o que faz a mudança valer alguma coisa.** O computador do GitHub
é destruído no fim de cada execução, e tudo que o ciclo produz é gravado em arquivo dentro
do projeto:

- `config/calendario.json` — o calendário editorial da semana
- `knowledge/<slug>/` — os dossiês novos
- `knowledge/trends/` — o que está bombando

Sem esse commit, o ciclo gastaria API todo dia para produzir um calendário que morreria
junto com a máquina. Se você **não** vir esse commit por vários dias seguidos, ou o ciclo
não está rodando, ou não achou nada novo (o commit só acontece quando algo mudou).

Se você trabalha no repositório na sua máquina, lembre de dar `git pull` antes de começar —
o robô empurrou coisa nova durante a noite.

### Por que isso mudou de lugar

Antes o ciclo rodava pelo Agendador de Tarefas do seu computador. Isso significa que
**PC desligado = produto parado**. Foi o que aconteceu entre **19 de julho e 2 de setembro
de 2026**: 45 dias sem rodar, e nada avisou — o calendário editorial ficou congelado na
semana de 19 de julho.

Agora roda num computador do GitHub, que está sempre ligado. E quando falha, avisa.

---

## 2. Onde ver o que aconteceu

Tudo fica em **GitHub → aba `Actions`** do repositório
(`https://github.com/Russete77/alohabjj/actions`).

1. Clique em **"Ciclo diario"** na coluna da esquerda.
2. A lista mostra um item por dia. ✅ verde = rodou. ❌ vermelho = falhou.
3. Clique num item para ver o passo a passo e a saída de cada comando.

### O log completo (arquivo)

O computador do GitHub é descartado no fim de cada execução — o `jobs/` não sobrevive.
Por isso o ciclo **guarda os logs como anexo**:

- Abra a execução na aba `Actions`
- Role até o fim da página, seção **Artifacts**
- Baixe **`logs-diario-<número>`** — dentro vêm os `jobs/*.log` (o diário de bordo) e os
  `jobs/*.jsonl` (o registro de tokens e custo de cada chamada de IA)

Os anexos ficam disponíveis por **30 dias**.

---

## 3. O que acontece quando falha

O ciclo **abre uma issue neste próprio repositório** com o título
`Ciclo diario falhou (AAAA-MM-DD)` e a etiqueta `ciclo-diario`. Você recebe por e-mail,
sem precisar de nenhum serviço contratado.

A issue traz:

- o link direto para a execução que falhou;
- as **últimas 60 linhas do log** — normalmente já dizem o que quebrou;
- o nome do anexo com os logs completos.

Se falhar vários dias seguidos, **não abre uma issue por dia**: ela comenta na issue que
já está aberta (o comentário também te manda e-mail). Quando o ciclo voltar a rodar com
sucesso, a issue é **fechada automaticamente**.

> Portanto: **"tem issue aberta com a etiqueta `ciclo-diario`" = o produto está quebrado agora.**

### Passo a passo quando chegar o e-mail

1. Abra a issue e leia o trecho de log.
2. Os erros mais comuns e o que significam:

| O que aparece no log | O que é | O que fazer |
|---|---|---|
| `ANTHROPIC_API_KEY ausente` | O segredo não está cadastrado (ou foi apagado) | Cadastre de novo — ver seção 4 |
| `SpendCapExceeded` / `teto de gasto` | O run bateu no limite de gasto de API do dia | Normal se teve muita pauta. Se repetir, aumente `SPEND_CAP_USD` |
| `401` / `403` / `invalid api key` | A chave expirou ou foi revogada | Gere uma chave nova no provedor e atualize o segredo |
| `529` / `overloaded` | A API da Anthropic estava sobrecarregada | Não faça nada. Dispare na mão (seção 5) ou espere o dia seguinte |
| `deploy=FALHOU` | Não conseguiu subir o snapshot para o Supabase | Confira `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` |
| `Nao consegui empurrar o resultado do ciclo` | Alguém commitou no mesmo minuto e deu conflito | O trabalho do dia foi salvo como `_commit-nao-empurrado.patch` dentro do anexo de logs. O jeito simples: rode de novo na mão (seção 5) |
| `timeout` / o job foi cortado em 60 min | Algum passo travou | Dispare na mão e acompanhe. Se repetir, é bug — chame o desenvolvedor |

3. Depois de corrigir, **dispare na mão** (seção 5) para confirmar. Se der certo, a issue
   fecha sozinha.

---

## 4. Segredos — o que cadastrar e onde

Os segredos são as chaves e senhas do sistema. Na sua máquina eles moram no arquivo
`.env` da raiz do projeto. **Esse arquivo não vai para o GitHub** (de propósito) — no
GitHub eles ficam num cofre separado.

### Onde cadastrar

`https://github.com/Russete77/alohabjj/settings/secrets/actions` → botão
**`New repository secret`** → preencha `Name` e `Secret` → **`Add secret`**.

> Você **não consegue ler** um segredo depois de salvo — só substituir. Se perder a chave,
> gere outra no provedor.

### Obrigatórios — sem estes o ciclo não roda

| Nome | O que é | Onde conseguir |
|---|---|---|
| `ANTHROPIC_API_KEY` | Chave da API do Claude. É ela que escreve os dossiês e o plano | console.anthropic.com |
| `SUPABASE_URL` | Endereço do banco/storage do projeto | Painel do Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servidor do Supabase. **Nunca** coloque essa no portal/front | Painel do Supabase → Project Settings → API |

### Opcionais — cadastre só se quiser o comportamento

| Nome | Para que serve | Se não cadastrar |
|---|---|---|
| `SPEND_CAP_USD` | Teto de gasto de API **por execução**, em dólares | Assume `10` |
| `DAILY_SPEND_CAP_USD` | Teto de gasto **somando todas as execuções do dia** | Assume `20` |
| `SCOUT_MODEL` | Modelo dos scouts: `haiku` (barato) ou `sonnet` (texto melhor) | Assume `haiku` |
| `GEMINI_API_KEY` | Geração de imagem (Google) | Sem efeito no ciclo diário hoje |
| `OPENAI_API_KEY` | Geração de imagem (OpenAI) | Sem efeito no ciclo diário hoje |
| `RUNWAYML_API_SECRET` | Geração de imagem/vídeo (Runway) | Sem efeito no ciclo diário hoje |

> As três chaves de imagem estão no ciclo por antecipação: hoje a geração de arte roda em
> comandos separados (`orchestrator.art`, `orchestrator.build_carousel`), fora do diário.
> Deixá-las cadastradas não custa nada e evita surpresa no dia em que a arte entrar no ciclo.

---

## 5. Como disparar na mão

Quando você corrigiu algo, ou simplesmente quer rodar agora sem esperar as 06:00:

1. GitHub → aba **`Actions`** → **`Ciclo diario`** (coluna da esquerda)
2. Botão **`Run workflow`** (canto direito)
3. Opcionalmente ajuste:
   - **Quantas pautas novas na Fase A** — padrão `2`. Mais pautas = mais gasto de API.
   - **Pular o Trend Scout** — marque para economizar uma chamada quando você só quer
     replanejar o calendário.
4. Confirme em **`Run workflow`** verde.

O run aparece na lista em alguns segundos. Acompanhe pela própria página.

> Para disparar **uma tarefa específica** (um carrossel, um curso, caçar produtos), o
> caminho é outro: os botões do `/admin`. Como eles funcionam agora está na **seção 9**.

---

## 6. Testes automáticos

Existe um segundo workflow, **`Testes`**, que roda sozinho a cada mudança de código
(commit na `main` ou abertura de pull request). Ele executa:

- os 26 testes do pipeline em Python (`pytest`);
- os 17 testes do portal (`node --test`), a checagem de tipos e o build de produção.

**Ele não gasta API nenhuma** e não precisa de segredo. Se ficar vermelho, alguma mudança
quebrou algo — não faça deploy até voltar ao verde.

---

## 7. Riscos que você precisa conhecer

### 7.1. Não rode o agendador local e o GitHub ao mesmo tempo

Se a tarefa `AlohaBJJ-Daily` ainda estiver registrada no Agendador de Tarefas do Windows,
o ciclo roda **duas vezes por dia** e você paga API em dobro, além de gerar pautas
duplicadas. Para remover a tarefa local, abra o PowerShell e rode:

```powershell
Unregister-ScheduledTask -TaskName "AlohaBJJ-Daily" -Confirm:$false
```

Para conferir se ela ainda existe:

```powershell
Get-ScheduledTask -TaskName "AlohaBJJ-Daily"
```

O agendador local continua sendo uma alternativa válida (ver `scripts/register_daily_task.ps1`),
mas **um dos dois, nunca os dois**.

### 7.2. O GitHub desliga agendamentos em repositório parado

Esta é a armadilha que mais se parece com o problema original. **Se o repositório ficar
60 dias sem nenhum commit, o GitHub desativa automaticamente os workflows agendados** —
e o ciclo para de rodar sem falhar, ou seja, **sem abrir issue**. O GitHub envia um e-mail
avisando; não ignore esse e-mail. Para religar: `Actions` → `Ciclo diario` → botão
**`Enable workflow`**.

### 7.3. Falha silenciosa é o defeito que o alerta ainda não cobre

O alerta por issue cobre "rodou e deu erro". Ele **não** cobre "não rodou" — workflow
desativado, Actions desligado no repositório, conta suspensa. O jeito completo de resolver
isso, também de graça, é um *dead man's switch*: um serviço externo (por exemplo o plano
gratuito do **healthchecks.io** ou do **cron-job.org**) que espera um "estou vivo" todo dia
e te avisa quando o sinal **não** chega. Fica como próximo passo; hoje o hábito que
substitui isso é olhar a aba `Actions` uma vez por semana.

### 7.4. O teto do dia depende de um cache

O teto `DAILY_SPEND_CAP_USD` é calculado somando os registros de gasto da pasta `jobs/`.
Essa pasta não vai para o repositório, e o computador do GitHub é novo a cada execução —
então o ciclo guarda e recupera o gasto do dia num **cache** do próprio GitHub, com a data
na chave (por isso o contador zera sozinho à meia-noite UTC, que é 21:00 em Brasília).

Consequência prática: se esse cache se perder (é raro, mas o GitHub descarta caches
antigos ou pouco usados), o contador do dia volta a zero e o teto diário deixa de valer
naquele dia. O teto **por execução** (`SPEND_CAP_USD`) continua valendo sempre — ele é a
proteção que não depende de nada externo. Se o custo importa muito, mantenha
`SPEND_CAP_USD` num valor com o qual você dorme tranquilo mesmo se rodar algumas vezes.

### 7.5. O horário pode atrasar

O agendamento do GitHub não é cronômetro: em horário de pico o run pode sair alguns minutos
(às vezes dezenas) depois das 06:00. Isso é normal e não é falha.

---

## 8. Resumo de emergência

| Situação | Onde ir |
|---|---|
| "O calendário parou de atualizar" | `Actions` → `Ciclo diario` → o último run está verde? |
| "Recebi e-mail de falha" | Abra a issue, leia o log, veja a tabela da seção 3 |
| "Preciso rodar agora" | `Actions` → `Ciclo diario` → `Run workflow` (seção 5) |
| "Trocaram minha chave de API" | `Settings` → `Secrets and variables` → `Actions` (seção 4) |
| "Quero ver quanto gastei" | Painel `/admin/custos`, ou os `jobs/*.jsonl` do anexo |
| "Cliquei em Rodar e não aconteceu nada" | É normal: o botão enfileira (seção 9) |
| "Faz dias que o que eu peço no painel não sai" | Fila parada — seção 9.4 |

---

## 9. Os botões "Rodar" do painel — o que eles fazem de verdade

### 9.1. O botão não executa. Ele PEDE.

Quando você clica em **`▶ Rodar`** no `/admin/agentes` (ou nos botões do calendário), o
portal **não** começa a trabalhar naquele instante. Ele **anota o seu pedido numa fila** e
responde na hora. Quem faz o trabalho é outra máquina, depois.

Isso não é preguiça do sistema — é o único jeito de funcionar. O portal roda na Vercel, que
é um serviço de páginas: lá **não existe o Python**, não existe o projeto em disco e nada
sobrevive de uma requisição para a outra. Antes desta mudança o botão tentava rodar o
pipeline ali mesmo. Não rodava: o console ficava piscando para sempre e nada acontecia.
Era **tela morta com cara de tela viva** — o pior tipo de defeito, porque não parece
defeito.

Agora a tela é honesta. Depois de clicar você vê, em ordem:

| O que aparece no console | O que significa |
|---|---|
| `na fila desde 02/09/2026 20:14 — aguardando o worker` | Anotado. Ainda não começou |
| `executando desde …` | Alguém pegou o seu pedido e está trabalhando |
| `concluído em … ✔` | Pronto. O resultado já está no painel |
| `FALHOU em … ` + o erro | Rodou e quebrou. O motivo vem junto |

**Pode fechar a tela.** O pedido está gravado no banco; fechar o navegador não cancela nada.

### 9.2. Quem executa o que você pediu

Duas coisas esvaziam a fila:

1. **O ciclo diário**, todo dia às 06:00 (seção 1). Ele terminou o trabalho automático e,
   como último passo, executa o que estiver na fila.
2. **Você, na mão**, quando não quer esperar até amanhã.

Ou seja: **na prática, o que você pedir hoje sai de madrugada**, junto com o ciclo. Se for
urgente, use o item 3 abaixo.

### 9.3. Como fazer sair agora

**O jeito fácil (sem instalar nada):** GitHub → aba `Actions` → `Ciclo diario` →
`Run workflow` (é o mesmo passo a passo da seção 5). O ciclo roda inteiro e, no fim, esvazia
a fila. Custa as chamadas de API do ciclo, além das do seu pedido.

**O jeito direto (no seu computador, se o projeto estiver instalado nele):** abra o
PowerShell na pasta do projeto e rode

```powershell
python -m orchestrator.worker
```

Ele pega tudo que está na fila, executa uma tarefa de cada vez e sai. Para executar só a
mais antiga e parar, use `python -m orchestrator.worker --once`.

> O worker **não fica rodando de plantão**. Ele esvazia a fila e encerra. É de propósito:
> programa que fica dormindo em segundo plano morre calado e ninguém percebe — foi assim
> que o produto ficou 45 dias parado em julho.

### 9.4. Fila cheia = ninguém está executando

Este é o sintoma que você precisa saber reconhecer. Se você pede coisas no painel e elas
ficam dias em **`na fila`**, o problema **não** é o seu pedido: é que **o worker não está
rodando**. Traduzindo: o ciclo diário não está rodando.

Vá para a seção 2 e olhe a aba `Actions`. O último `Ciclo diario` está verde? Está
acontecendo todo dia? Se não, resolva isso — a fila é só o sintoma.

Para ver a fila por dentro (Supabase → `SQL Editor`):

```sql
select status, count(*) from run_queue group by status;

select task, status, requested_at, error
  from run_queue order by requested_at desc limit 20;
```

Muita linha `pendente` e nenhuma `concluido` recente confirma o diagnóstico.

### 9.5. O que pode dar errado, e o que fazer

**Resolvido em 02/09.** O `diario.yml` passou a instalar Node 22 e rodar `npm ci`
em `web/`, porque o quinto passo do ciclo drena a fila e a fila aceita `carrossel`
e `plataformas` — que chamam os renderizadores de imagem.

O motivo de não ter deixado como estava: o render é best-effort, então sem Node a
tarefa terminaria **"concluído"** com o texto pronto e **sem imagem nenhuma**. Você
só descobriria ao abrir o painel pra postar. Falha silenciosa é a pior de todas, e
um minuto de `npm ci` por dia é barato demais pra correr esse risco.

### 9.6. Cada clique gasta dinheiro

A fila dispara chamadas de IA de verdade. Duas proteções continuam valendo, as mesmas do
ciclo diário (seção 4): o teto por execução (`SPEND_CAP_USD`) e o teto do dia
(`DAILY_SPEND_CAP_USD`). Além disso, o worker executa no máximo **20 tarefas por passada** —
se a fila tiver mais que isso, o resto espera a próxima. É a trava que impede um clique
repetido virar uma fatura.

Por isso também a tabela `run_queue` **não é pública**: ela está fechada no banco (RLS
ligada, sem nenhuma permissão para visitante anônimo) e a rota que enfileira está atrás da
senha do `/admin`. Ninguém de fora consegue pedir trabalho no seu lugar.
