# Regras — direitos de imagem, compliance e brand tokens

## 1. Direitos de imagem (PRD §11, §22)
- Slides usam **assets próprios ou licenciados**. Nunca reusar foto de atleta sem direito.
- Fonte de imagem preferida: acervo próprio do AlohaBJJNews > banco licenciado.
- Imagem de atleta em breakdown: usar silhueta/pixel-art/diagrama próprio quando não houver licença.

### 1.1 Direção de arte da IA — evitar leitura sensual (lição de 16/07/2026)
Arte gerada por IA para heros **não pode** ler como cena íntima. Regra:
- ❌ **Evitar:** dois corpos entrelaçados no chão em silhueta, guarda fechada em close, luz vermelha quente e difusa (névoa romântica). Isso lê como cena de sexo → off-brand + risco de flag.
- ✅ **Exigir:** contexto inequívoco de esporte — gi/faixa ou rashguard, tatame/arena visível, ação atlética (projeção, queda, clinch em pé). Vermelho da marca como **aresta gráfica/luz dura**, sombra fria, não névoa quente. Sem rosto/pessoa identificável.

## 2. Compliance (PRD §12, §13)
- **CONAR:** afiliado (Hayabusa) ou produto próprio remunerado → divulgação clara e imediata na **1ª linha** da caption (selo "parceria paga"/"conteúdo promocional" + #publi). "Link na bio" NÃO conta.
- **IA disclosure de plataforma:** `is_ai_generated=true` no `meta.json` de toda peça (TikTok exige; não marcar = risco de shadow ban). Avatar de IA rotulado como artificial.
- *Não é aconselhamento jurídico; confirmar com advogado.*

## 3. Brand tokens (placeholder — refinar na Fatia 2 com skill de design)
> Estes valores servem de base para o render de slides (Playwright) e o painel (React/Shadcn).
> Ainda NÃO são o design final — a Fatia 2 define paleta/tipografia definitivas ("clean e profissional").

```yaml
brand:
  nome: AlohaBJJNews
  # Paleta placeholder — trocar pelos tokens oficiais da marca na Fatia 2
  cores:
    primaria:   "#0B0B0F"   # fundo escuro (placeholder)
    destaque:   "#E11D2A"   # vermelho BJJ (placeholder)
    texto:      "#F5F5F5"
    sutil:      "#9CA3AF"
  tipografia:
    titulo: "Inter, system-ui, sans-serif"
    corpo:  "Inter, system-ui, sans-serif"
  logo: assets/logo-aloha.svg   # TODO: adicionar asset real
```
