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

## O link é ESTÁVEL: `alohabjjnews.com/k/<PALAVRA>`
Você **não** troca o link no ManyChat a cada post. Cada palavra tem um **link fixo** que o
sistema resolve sozinho: `.../k/GI`, `.../k/NOGI`, `.../k/PERNA`, etc. Essa rota:
1. acha o produto com aquela palavra no catálogo (`/admin/catalogo`),
2. **registra o clique** (aparece em `/admin/conversao`),
3. redireciona pro **link de afiliado atual** (`url_base`) daquele produto.

Trocou o link de afiliado no `/admin/catalogo`? Todas as DMs daquela palavra já apontam pro
novo destino — **sem tocar no ManyChat**. Sem link cadastrado, cai no portal (curso grátis).

## Como montar cada fluxo no ManyChat (uma vez por palavra — nunca mais mexe)
1. ManyChat → **Automation** → **New Automation** → gatilho **Instagram → Comments** (ou "Keyword").
2. Trigger: quando o comentário **contém** a palavra (ex.: `GI`).
3. Ação: **Send Message (DM)** com:
   - a **divulgação #publi** na 1ª linha (afiliado): "Conteúdo com parceria paga 🤝";
   - o **link fixo**: `https://alohabjjnews.com/k/GI` (troque só a palavra por fluxo);
   - opcional: pedir e-mail (captura o lead p/ vender os **cursos pagos** depois).
4. (Recomendado) responder o comentário publicamente ("Te mandei no direct! 📲") — alcance.

> São 8 fluxos (CURSO, GI, NOGI, PERNA, GUARDA, COSTAS, GEAR, LOJA), cada um mandando
> `.../k/<PALAVRA>`. Feito uma vez, o sistema cuida do resto.

## Regra de ouro (compliance)
A DM de produto afiliado/remunerado **precisa** da divulgação clara (#publi / "parceria paga")
na 1ª linha — igual à caption. "Link na bio" e "mando no direct" **não** dispensam a divulgação.

## Por que não usar a API do ManyChat pra criar os fluxos?
A API pública do ManyChat **não cria growth tools / gatilhos de comentário** (isso é só na UI).
Ela envia conteúdo e mexe em campos de assinante. Por isso a arquitetura certa é o **link estável
`/k/<PALAVRA>`**: o fluxo no ManyChat é fixo, e a inteligência (qual link, tracking, trocar o
destino) fica do nosso lado — testável, versionado e editável no `/admin/catalogo`. Zero
dependência de API pra converter.

## Funil grátis → pago
`CURSO` (grátis) capta o lead no ManyChat → sequência de nutrição → quando lançar os
**cursos pagos**, dispara a oferta (`PRO`) pra essa base já aquecida. A isca gratuita é o topo
do funil; o afiliado monetiza no meio; o curso pago é o fundo (maior margem).
