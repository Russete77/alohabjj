# ManyChat — funil comment-to-DM (guia de setup)

O sistema gera o **CTA comment-to-DM** ("Comenta [PALAVRA] que te mando o link no direct 📲")
e a **palavra** (do campo `manychat` do catálogo). O ManyChat faz o resto: detecta a palavra
no comentário → manda a DM com o link. Você configura **um fluxo por palavra, uma vez** (reusável).

## Palavras → produto → o que a DM manda
| Palavra | Produto | A DM manda |
|---|---|---|
| `CURSO` | Curso 100kg (grátis, isca) | link do curso gratuito + captura o lead |
| `GI` | Kimono de competição (afiliado) | link de afiliado do gi + #publi |
| `NOGI` | Rashguard/gear No-Gi (afiliado) | link de afiliado do rashguard + #publi |
| `PERNA` | Instrucional de leg locks (afiliado) | link do instrucional + #publi |
| `GUARDA` | Instrucional de guarda/passagem | link do instrucional + #publi |
| `COSTAS` | Instrucional de costas/mata-leão | link do instrucional + #publi |
| `GEAR` | Equipamento Hayabusa (afiliado) | link + cupom LUCAS -10% + #publi |
| `LOJA` | Loja BJJ3D (própria) | link da loja |
| `PRO`  | **(futuro)** cursos PAGOS | checkout do curso pago |

## Como montar cada fluxo no ManyChat (uma vez por palavra)
1. ManyChat → **Automation** → **New Automation** → gatilho **Instagram → Comments** (ou "Keyword").
2. Trigger: quando o comentário **contém** a palavra (ex.: `GI`).
3. Ação: **Send Message (DM)** com:
   - a **divulgação #publi** na 1ª linha (afiliado): "Conteúdo com parceria paga 🤝";
   - o **link** do produto (afiliado/curso);
   - opcional: pedir e-mail (captura o lead p/ vender os **cursos pagos** depois).
4. (Recomendado) responder o comentário publicamente ("Te mandei no direct! 📲") — alcance.

## Regra de ouro (compliance)
A DM de produto afiliado/remunerado **precisa** da divulgação clara (#publi / "parceria paga")
na 1ª linha — igual à caption. "Link na bio" e "mando no direct" **não** dispensam a divulgação.

## Integração automática (próximo nível — opcional)
O ManyChat tem **API**. Dá pra o pipeline, quando publicar, criar/atualizar o fluxo da palavra
e injetar o link de afiliado do momento (o `link_afiliado` do `meta.json`). Por ora: fluxos fixos
por palavra (setup manual, reusável) + o sistema escolhe a palavra certa por peça.

## Funil grátis → pago
`CURSO` (grátis) capta o lead no ManyChat → sequência de nutrição → quando lançar os
**cursos pagos**, dispara a oferta (`PRO`) pra essa base já aquecida. A isca gratuita é o topo
do funil; o afiliado monetiza no meio; o curso pago é o fundo (maior margem).
