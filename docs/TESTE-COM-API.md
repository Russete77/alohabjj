# Guia de teste — quando a `ANTHROPIC_API_KEY` estiver ativa

Tudo já está plugado. Ao colocar a chave, o pipeline roda de verdade e a **Academia AlohaBJJ** (`/admin/agentes`) passa a mostrar o trabalho **real** dos agentes (não mais o roteiro demo), via a ponte que lê `jobs/*.jsonl`.

## 1. Colocar a chave
```bash
cd C:\Users\erick\bjj-lucas
# no .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   SPEND_CAP_USD=10          (teto de gasto por run)
# (opcional, imagem complexa)  GEMINI_API_KEY= / OPENAI_API_KEY= / RUNWAYML_API_SECRET=
```

## 2. Subir o painel (num terminal)
```bash
cd web && npm run dev        # http://localhost:3000/admin/agentes
```
Deixe essa aba aberta na tela dos Agentes.

## 3. Rodar o pipeline (noutro terminal) e VER ao vivo
Cada comando faz os agentes acenderem no tatame (balão = o que estão processando; ✓ quando terminam):

```bash
# Fase A — acha pauta nova e cria dossiê (Pesquisador→Validador→Analista)
python -m orchestrator.phase_a --max 1

# Fase B — gera um carrossel de um dossiê (Supervisor→Carrossel→Avaliador)
python -m orchestrator.build_carousel <slug> --slides 6

# Pacotes por plataforma (Empacotador)
python -m orchestrator.build_platforms <slug>

# Imagem complexa (Render+IA) — se tiver chave de imagem
#   (o build_carousel já dispara o hero quando hero_complexo=true)
```
> `<slug>` = uma pasta em `knowledge/` (ex.: `gordon-ryan-vs-yuri-simoes-adcc-2024-...`).

Custo de tudo aparece em `jobs/<run_id>.jsonl` e no fim de cada comando.

## 4. O que observar
- **`/admin/agentes`**: o agente que está rodando fica com balão tipo *"apurando fontes · <slug>…"*; ao terminar, *"feito ✓ ($0.03)"*. Sem pipeline rodando, volta pro roteiro demo em ~5s.
- **`/admin`**: novos dossiês/peças aparecem na fila; **Aprovar e publicar** joga no portal.
- **`/` (portal)**: os dossiês publicados viram artigos.

## 5. Barato primeiro
- `python -m orchestrator.phase_a --free` → triagem RSS+dedupe **sem gastar** (valida as fontes).
- `--max 1` / `--slides 4` → limita o gasto no teste.
- `SPEND_CAP_USD` corta o run se passar do teto.

## 6. Loop diário (produção)
`scripts/daily.py` (cron/Agendador) roda a Fase A sozinho todo dia — ver o topo do arquivo.

---
**Resumo:** chave no `.env` → `npm run dev` no `web/` → rodar um `orchestrator/*` → assistir na academia. Sem chave, tudo segue em modo demo/triagem grátis.
