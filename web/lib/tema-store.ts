// Leitura e escrita do tema. O tema mora no app_config como qualquer outra
// config editável: banco manda, arquivo é semente (ver lib/config-store.ts).
import { lerConfig, salvarConfig } from "./config-store";
import { mesclaTema, temaValido, type Tema } from "./tema";

export const PATH_TEMA = "config/tema.json";

/** O tema valendo. Nunca falha: sem banco e sem arquivo, cai no padrão. */
export async function lerTema(): Promise<Tema> {
  try {
    const bruto = await lerConfig(PATH_TEMA);
    return mesclaTema(bruto ? JSON.parse(bruto) : null);
  } catch {
    // JSON corrompido não pode derrubar o portal inteiro — a marca padrão
    // renderiza, e a tela de tema mostra o problema quando o operador abrir.
    return mesclaTema(null);
  }
}

export async function salvarTema(
  t: Tema,
): Promise<{ ok: true } | { ok: false; erros: string[] }> {
  const { erros } = temaValido(t);
  if (erros.length) return { ok: false, erros };
  const r = await salvarConfig(PATH_TEMA, JSON.stringify(t, null, 2), "painel");
  return r.ok ? { ok: true } : { ok: false, erros: [r.erro] };
}
