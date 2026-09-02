// Regras do CMS de conteúdo — lógica pura, testável sem banco e sem rede.
//
// O princípio da casa: o ARQUIVO é o artefato (o que a IA produziu, preservado
// no disco), o BANCO é o estado. A edição do operador é estado: mora no banco,
// vence na hora de renderizar, e nunca apaga o original. Regerar o dossiê não
// destrói a correção; desfazer a correção é gravar null.

// `.ts` explícito: o type stripping do Node (usado por `node --test`)
// não resolve extensão sozinho. O tsconfig tem allowImportingTsExtensions.
import { normalizaTag } from "./porteiro.ts";

export interface EdicaoDoBanco {
  resumo_editado?: string | null;
  imagem_editada?: string | null;
  tags?: string[];
}

export interface ConteudoDoArquivo {
  slug: string;
  resumoParas: string[];
  imagem: string | null;
  tags: string[];
}

/** Separa parágrafos do markdown, descartando o título do topo. */
export function parseParagrafos(md: string): string[] {
  const corpo = md.replace(/^#[^\n]*\n+/, "");
  return corpo
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Tag digitada à mão vira o mesmo formato do resto do sistema. */
export function normalizaTagLivre(tag: string): string {
  return normalizaTag(tag);
}

/**
 * Aplica a edição do operador sobre o que veio do arquivo.
 *
 * A distinção que importa: `null` é "nunca editado" (vale o arquivo) e string
 * vazia é "o operador apagou de propósito" (vale o vazio). Tratar os dois igual
 * tornaria impossível esvaziar um campo — ou impossível desfazer uma edição.
 */
export function aplicaEdicao<T extends ConteudoDoArquivo>(
  base: T, ed: EdicaoDoBanco,
): T & { editado: boolean } {
  const corpoEditado = ed.resumo_editado != null;
  const capaEditada = ed.imagem_editada != null && ed.imagem_editada !== "";
  // Lista vazia = nenhuma linha em dossier_tags = nunca editado. Não é o mesmo
  // que "removi todas": pra isso o operador deixa uma tag ou o campo é limpo
  // explicitamente, o que grava uma linha-sentinela no lado de quem escreve.
  const tagsEditadas = Array.isArray(ed.tags) && ed.tags.length > 0;

  return {
    ...base,
    resumoParas: corpoEditado ? parseParagrafos(ed.resumo_editado!) : base.resumoParas,
    imagem: capaEditada ? ed.imagem_editada! : base.imagem,
    tags: tagsEditadas ? ed.tags! : base.tags,
    editado: corpoEditado || capaEditada || tagsEditadas,
  };
}

/**
 * As tags já em uso, ordenadas por frequência.
 *
 * Alimenta o seletor da tela. Sem isso, tag é texto livre e o sistema acumula
 * "no-gi", "nogi" e "No-Gi" convivendo — o Supervisor tolera, mas cada variante
 * é ruído no casamento pauta × produto e o operador nunca vê o que existe.
 */
export function vocabularioDeTags(
  itens: { tags?: string[] }[],
): { tag: string; usos: number }[] {
  const conta = new Map<string, number>();
  for (const it of itens) {
    for (const bruta of it.tags ?? []) {
      const t = normalizaTag(bruta);
      if (t) conta.set(t, (conta.get(t) ?? 0) + 1);
    }
  }
  return [...conta.entries()]
    .map(([tag, usos]) => ({ tag, usos }))
    .sort((a, b) => b.usos - a.usos || a.tag.localeCompare(b.tag));
}
