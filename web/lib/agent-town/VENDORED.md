# agent-town (vendorizado)

Código-fonte de **[rafapetter/agent-town](https://github.com/rafapetter/agent-town)** (MIT), vendorizado aqui porque a release 0.2.0 no npm veio sem os arquivos `dist/` buildados.

## Modificações para o AlohaBJJ (BJJ)
- `renderer.ts` → `getEnvPalette` (case `office`): personagens usam **kimono (gi)** branco/azul, pés descalços.
- `renderer.ts` → `drawAgent`: desenha a **faixa de BJJ** na cintura, na cor de `agent.team` (graduação = nível do modelo). Graus brancos na faixa preta.
- `themes.ts` → `ENV_COLORS.office`: piso recolorido para tons de **tatame**.

Uso no app: `web/app/(admin)/admin/agentes/AgentTownView.tsx`.

Licença original: MIT (Rafael Petter). Ver o repositório upstream.
