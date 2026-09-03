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

// ── Leitura para a tela de edição ─────────────────────────────────────────

/** O que a tela precisa saber sobre um dossiê pra deixar editar. */
export interface ParaEditar {
  slug: string;
  titulo: string;
  /** O que a IA escreveu, do arquivo. Fica sempre visível como referência. */
  corpoOriginal: string;
  /** O que vale agora: a edição, ou o original quando nunca foi editado. */
  corpoAtual: string;
  editado: boolean;
  imagemOriginal: string | null;
  imagemAtual: string | null;
  tags: string[];
  editadoEm: string | null;
}

/** Junta os parágrafos de volta no formato que o operador edita (texto corrido). */
export function paragrafosParaTexto(paras: string[]): string {
  return paras.join("\n\n");
}

// ── Publicação criada do zero ─────────────────────────────────────────────
//
// Todo dossiê nascia do pipeline — do RSS ou do backfill do WordPress — e a
// lista do portal é montada A PARTIR DO DISCO, com o banco por cima. Um post
// escrito à mão não tem artefato em disco, então precisava de um caminho
// próprio: ele existe só no banco, e `dossieDoBanco` o transforma no mesmo
// formato que o resto do sistema consome.

/** Título → slug de URL. Sem acento, sem pontuação, sem hífen dobrado. */
export function gerarSlug(titulo: string): string {
  const base = String(titulo)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  // Título só com símbolos geraria slug vazio — e slug vazio vira rota quebrada.
  return base || `post-${Date.now().toString(36)}`;
}

/** Primeiro slug livre a partir do título. Sufixo numérico em vez de sobrescrever. */
export function slugLivre(titulo: string, usados: Set<string>): string {
  const base = gerarSlug(titulo);
  if (!usados.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    const tentativa = `${base}-${i}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface LinhaDossieBanco {
  slug: string;
  titulo?: string | null;
  categoria?: string | null;
  data?: string | null;
  evento?: string | null;
  resumo_editado?: string | null;
  imagem_editada?: string | null;
  imagem?: string | null;
  status?: string | null;
  arquivado?: boolean | null;
  destaque?: boolean | null;
  ordem?: number | null;
}

const CATEGORIAS_VALIDAS = new Set(["superlutas", "noticias", "analises", "tecnica"]);
const LABEL: Record<string, string> = {
  superlutas: "Superlutas", noticias: "Notícias",
  analises: "Análises", tecnica: "Técnica",
};

/**
 * Monta um dossiê que existe SÓ no banco (post escrito à mão).
 *
 * `confianca: "alta"` de propósito: quem escreveu foi uma pessoa, não a
 * apuração automática. Marcá-lo como "media" o faria parecer saída de pipeline;
 * marcá-lo "baixa" o mandaria pra trava de confiança sem motivo.
 */
export function dossieDoBanco(r: LinhaDossieBanco) {
  const categoria = CATEGORIAS_VALIDAS.has(String(r.categoria)) ? String(r.categoria) : "noticias";
  return {
    slug: r.slug,
    titulo: r.titulo || r.slug,
    categoria: categoria as "superlutas" | "noticias" | "analises" | "tecnica",
    categoriaLabel: LABEL[categoria],
    atletas: [] as string[],
    evento: r.evento || "",
    data: r.data || "",
    resumoParas: r.resumo_editado ? parseParagrafos(r.resumo_editado) : [],
    imagem: r.imagem_editada || r.imagem || null,
    fonteUrl: null,
    confianca: "alta",
    tags: [] as string[],
    status: r.status ?? undefined,
    arquivado: r.arquivado ?? undefined,
    destaque: r.destaque ?? undefined,
    ordem: r.ordem ?? null,
    manual: true,
  };
}
