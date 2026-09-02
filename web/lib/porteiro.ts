// Espelho TypeScript de lib/porteiro.py. As duas metades existem de propósito:
// o Python decide o que entra no snapshot, o TS decide o que o portal serve.
// Testar só uma deixa a outra livre pra vazar. Sem imports — lógica pura.
//
// Regra da casa: falhar FECHADO. Na dúvida, não vai ao ar.

export const TAGS_BLOQUEIO = new Set([
  "nao-verificado",
  "apuracao-incompleta",
  "pendente",
  "nao-confirmado",
  "tema-sensivel",
  "rumor",
]);

/** "tema sensível" -> "tema-sensivel" */
export function normalizaTag(tag: string): string {
  return String(tag)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .join("-")
    .replace(/_/g, "-");
}

/** Por que publicar exige confirmação extra — ou null se está limpo. */
export function motivoBloqueio(
  meta: { confianca?: string; tags?: string[] } | null | undefined,
): string | null {
  if (!meta) return null;
  if (String(meta.confianca ?? "").toLowerCase() === "baixa") return "confiança baixa";
  for (const tag of meta.tags ?? []) {
    if (TAGS_BLOQUEIO.has(normalizaTag(tag))) return `tag de bloqueio: ${tag}`;
  }
  return null;
}

/** O portal só serve o que o operador promoveu e não arquivou. */
export function podeIrAoAr(d: { status?: string; arquivado?: boolean } | null | undefined): boolean {
  if (!d) return false;
  return d.status === "published" && d.arquivado !== true;
}

/**
 * Devolve AAAA-MM-DD. Aceita ISO e RFC-822 (o WordPress mistura os dois).
 *
 * Espelha lib/dossier_index.normaliza_data. Cortar os 10 primeiros caracteres
 * — o que se fazia antes — transforma "Wed, 22 Apr 2026 11:44:44 +0000" em
 * "Wed, 22 Ap", que ordena ACIMA de qualquer data ISO e sequestra o card de
 * destaque da home.
 */
export function normalizaData(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
