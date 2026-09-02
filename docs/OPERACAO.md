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
| `SCOUT_MODEL` | Modelo dos scouts: `haiku` (barato) ou `sonnet` (texto melhor) | Assume `haiku` |
| `DAILY_SPEND_CAP_USD` | Teto diário **exibido** no painel `/admin/custos` | O painel mostra `—` |
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

### 7.4. O horário pode atrasar

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
