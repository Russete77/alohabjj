// Regras editoriais em funções PURAS — sem fs, sem fetch, sem imports.
//
// Mesmo motivo do porteiro.ts: o que decide o que o público vê precisa ser
// testável sem subir banco nem Next. Aqui mora a precedência banco-vence-arquivo
// e a ordenação da vitrine, que são as duas regras que, quando erram, erram em
// silêncio — a home mostra a editoria errada, ou o card de destaque some, e
// ninguém percebe até alguém reclamar.
//
// Regra da casa: falhar FECHADO. Valor estranho vindo do banco não vira
// editoria nova nem publica nada — cai no valor conhecido do arquivo.

export const CATEGORIAS = ["superlutas", "noticias", "analises", "tecnica"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const LABEL_CATEGORIA: Record<Categoria, string> = {
  superlutas: "Superlutas",
  noticias: "Notícias",
  analises: "Análises",
  tecnica: "Técnica",
};

/**
 * Mais de 3 destaques quebra o layout da home (o card grande vira uma pilha
 * de cards grandes). Não é trava, é aviso — quem decide é o operador.
 */
export const MAX_DESTAQUES = 3;

export function ehCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v);
}

/** O rótulo NUNCA é lido do arquivo: é sempre derivado da categoria vigente. */
export function rotuloCategoria(c: Categoria): string {
  return LABEL_CATEGORIA[c];
}

/** O que o operador editou. Vem do banco; qualquer campo pode faltar. */
export interface EstadoEditorial {
  status?: string | null;
  arquivado?: boolean | null;
  destaque?: boolean | null;
  ordem?: number | null;
  titulo?: string | null;
  categoria?: string | null;
}

/** O mínimo que `aplicaEstado` precisa enxergar do dossiê lido do arquivo. */
export interface ItemEditorial {
  slug: string;
  titulo: string;
  categoria: Categoria;
  categoriaLabel: string;
  data: string;
  status?: string;
  arquivado?: boolean;
  destaque?: boolean;
  ordem?: number | null;
}

/**
 * Funde o dossiê lido do arquivo com o estado editorial do banco.
 *
 * O banco VENCE — é a decisão D2 da spec. Mas vencer não é aceitar qualquer
 * coisa:
 *
 * - `titulo` vazio (ou só espaço) no banco é ausência de correção, não um
 *   título em branco: mantém o do arquivo, senão a home fica sem manchete.
 * - `categoria` fora das 4 válidas é dado corrompido: mantém a do arquivo.
 *   Aceitar produziria uma editoria que a home não renderiza e um rótulo
 *   `undefined` na tela.
 * - `categoriaLabel` é SEMPRE recalculado. Ele não é dado, é derivado — e
 *   espalhar o do arquivo por cima da categoria corrigida era exatamente o
 *   bug que fazia a correção de editoria "não pegar" no portal.
 *
 * `undefined` no segundo argumento significa "o banco respondeu e não conhece
 * este slug": o dossiê fica sem status e, portanto, fora do ar. Fecha.
 */
export function aplicaEstado<T extends ItemEditorial>(
  doArquivo: T,
  doBanco: EstadoEditorial | undefined,
): T {
  const e = doBanco ?? {};

  const tituloBanco = typeof e.titulo === "string" ? e.titulo.trim() : "";
  const categoria = ehCategoria(e.categoria) ? e.categoria : doArquivo.categoria;

  return {
    ...doArquivo,
    titulo: tituloBanco || doArquivo.titulo,
    categoria,
    categoriaLabel: rotuloCategoria(categoria),
    status: e.status ?? undefined,
    arquivado: e.arquivado === true,
    destaque: e.destaque === true,
    ordem: typeof e.ordem === "number" ? e.ordem : null,
  };
}

/**
 * Ordem da vitrine pública: destaque primeiro, depois a ordem manual (menor
 * primeiro; sem ordem cai pro fim), depois data mais recente. O slug entra só
 * como desempate — sem ele a ordem de dois itens idênticos varia entre
 * requisições e a home "pula" sozinha.
 *
 * Espelha o índice `idx_dossiers_vitrine` da migração da fase 1.
 */
export function ordenaVitrine<T extends ItemEditorial>(list: readonly T[]): T[] {
  const SEM_ORDEM = Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => {
    if (!!b.destaque !== !!a.destaque) return b.destaque ? 1 : -1;
    const ao = typeof a.ordem === "number" ? a.ordem : SEM_ORDEM;
    const bo = typeof b.ordem === "number" ? b.ordem : SEM_ORDEM;
    if (ao !== bo) return ao - bo;
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return a.slug < b.slug ? -1 : 1;
  });
}

/** Ordem do admin: só data (o operador quer ver o que chegou por último). */
export function ordenaAdmin<T extends ItemEditorial>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return a.slug < b.slug ? -1 : 1;
  });
}

/**
 * Campo "ordem" digitado na tela vira int ou null.
 *
 * Vazio = "sem ordem manual" (cai na data), e não zero — zero jogaria o item
 * pro topo da home sem ninguém pedir. Lixo também vira null: preferimos perder
 * a ordenação manual a inventar uma posição.
 */
export function normalizaOrdem(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  // int4 no Postgres; fora da faixa a gravação seria recusada pelo banco
  if (i < -2147483648 || i > 2147483647) return null;
  return i;
}

/** Título digitado na tela. Vazio significa "volta a valer o do arquivo". */
export function normalizaTitulo(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Quantos itens estão marcados como destaque (a home só comporta ~3). */
export function contaDestaques(list: readonly ItemEditorial[]): number {
  return list.filter((d) => d.destaque === true).length;
}

/**
 * Slug seguro pra virar caminho de arquivo.
 *
 * `apagarDossie` monta `knowledge/<slug>/` e chama rmSync recursivo. Um slug
 * com `..` ou barra apagaria diretório fora da base. É a única validação entre
 * um campo de formulário e um `rm -rf`.
 */
export function slugSeguro(raw: unknown): boolean {
  const s = String(raw ?? "");
  return /^[a-z0-9][a-z0-9-]{0,199}$/.test(s);
}
