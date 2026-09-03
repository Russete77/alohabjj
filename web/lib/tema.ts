// O tema da marca — um lugar só, servindo o PORTAL e a ARTE.
//
// Antes a identidade vivia cravada em três lugares que não conversavam:
// `app/globals.css` (tokens do portal), e os três renderizadores em
// `web/scripts/render_*.mjs`, cada um com a própria cópia da paleta e frases
// como "SIGA PARA MAIS BJJ" escritas na mão. Trocar a cor da marca exigia achar
// e editar os três — e eles divergiam (o vermelho do portal e o da arte eram o
// mesmo por sorte, não por construção).
//
// Lógica pura, sem imports: testável sem banco e sem rede.

export interface Tema {
  /** Paleta do tema claro. */
  cores: {
    ink: string;      // texto e superfície escura
    paper: string;    // fundo do portal
    red: string;      // acento da marca
    teal: string;     // faixa da arte
    tealEscuro: string;
  };
  /**
   * Paleta do tema ESCURO.
   *
   * Existe porque o bloco que o layout injeta vem depois do globals.css com a
   * mesma especificidade — então ele vence o @media (prefers-color-scheme:dark)
   * que já estava lá. Sem emitir o escuro junto, o portal fica preso no claro e
   * ignora a preferência do sistema. Foi o que aconteceu em produção.
   */
  coresEscuras: { ink: string; paper: string; red: string };
  fontes: { display: string; corpo: string };
  logo: { portal: string | null; arte: string | null; recorte: string | null };
  textos: {
    ticker: string;        // faixa vermelha do topo do portal
    rodapeArte: string;    // botão no rodapé dos slides
    assinatura: string;    // @perfil, repetido na faixa inferior
    dominioArte: string;   // domínio escrito no rodapé da arte
  };
}

export const TEMA_PADRAO: Tema = {
  cores: {
    ink: "#0B0B0C",
    paper: "#F5F3EF",
    red: "#D8232A",
    teal: "#1A9CB4",
    tealEscuro: "#16879C",
  },
  // Os mesmos valores que o globals.css já usava no modo escuro.
  coresEscuras: { ink: "#F4F1EE", paper: "#121110", red: "#E24B4A" },
  fontes: { display: "Anton", corpo: "Inter" },
  logo: { portal: null, arte: null, recorte: null },
  textos: {
    ticker: "Cobertura ao vivo · Mundial IBJJF · ADCC · resultados, superlutas e análises · @bjjcomlucas",
    rodapeArte: "SIGA PARA MAIS BJJ",
    assinatura: "@BJJCOMLUCAS",
    dominioArte: "ALOHABJJNEWS.COM",
  },
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Contraste WCAG entre duas cores (1 = idênticas, 21 = preto sobre branco). */
export function contraste(a: string, b: string): number {
  const lum = (hex: string): number => {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const canal = (i: number) => {
      const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Valida antes de salvar. Devolve os erros em texto, pro operador ler.
 *
 * O contraste entra como ERRO e não aviso de propósito: quem escolhe cor num
 * seletor bonito não tem como saber que o resultado é ilegível — o sistema tem.
 * Deixar salvar e depois "avisar" é empurrar pro operador uma conta que a
 * máquina sabe fazer.
 */
export function temaValido(t: Tema): { erros: string[] } {
  const erros: string[] = [];

  for (const [nome, valor] of Object.entries(t.cores)) {
    if (!HEX.test(String(valor))) {
      erros.push(`cor "${nome}": "${valor}" não é um hexadecimal (#RGB ou #RRGGBB)`);
    }
  }

  for (const [nome, valor] of Object.entries(t.textos)) {
    if (!String(valor).trim()) {
      erros.push(`texto "${nome}" está vazio — a arte ficaria com um buraco no lugar`);
    }
  }

  for (const [nome, valor] of Object.entries(t.fontes)) {
    if (!String(valor).trim()) erros.push(`fonte "${nome}" está vazia`);
  }

  // Só faz sentido medir contraste se as duas cores forem válidas.
  if (HEX.test(t.cores.ink) && HEX.test(t.cores.paper)) {
    const c = contraste(t.cores.ink, t.cores.paper);
    if (c < 4.5) {
      erros.push(
        `contraste insuficiente entre o texto (${t.cores.ink}) e o fundo ` +
        `(${t.cores.paper}): ${c.toFixed(1)}:1. O mínimo legível é 4.5:1.`,
      );
    }
  }
  if (HEX.test(t.cores.red) && HEX.test(t.cores.paper)) {
    const c = contraste(t.cores.red, t.cores.paper);
    if (c < 3) {
      erros.push(
        `o acento (${t.cores.red}) some no fundo (${t.cores.paper}): ${c.toFixed(1)}:1.`,
      );
    }
  }

  for (const [nome, valor] of Object.entries(t.coresEscuras ?? {})) {
    if (!HEX.test(String(valor))) {
      erros.push(`cor escura "${nome}": "${valor}" não é um hexadecimal`);
    }
  }
  const e = t.coresEscuras;
  if (e && HEX.test(e.ink) && HEX.test(e.paper)) {
    const c = contraste(e.ink, e.paper);
    if (c < 4.5) {
      erros.push(
        `no tema escuro, o contraste entre texto (${e.ink}) e fundo (${e.paper}) ` +
        `é ${c.toFixed(1)}:1 — o mínimo legível é 4.5:1.`,
      );
    }
  }

  return { erros };
}

/**
 * Neutraliza o que quebraria o CSS.
 *
 * O tema é DADO DE ENTRADA — vem de um formulário e do banco, não do código.
 * Sem isto, um nome de fonte com `";}</style><script>` fecha a tag e injeta
 * script na página. Tirar `<`, `>`, `"`, `;`, `{` e `}` mata a classe inteira.
 */
function limpo(v: string): string {
  return String(v).replace(/[<>"{};\\]/g, "").trim();
}

/**
 * As variáveis CSS do portal — tema claro E escuro, nesta ordem.
 *
 * O bloco escuro NÃO é opcional. Este CSS é injetado DEPOIS do globals.css com
 * a mesma especificidade, então um `:root` sozinho vence o
 * `@media (prefers-color-scheme: dark)` que já existe lá — e o portal fica
 * preso no claro, ignorando a preferência do sistema. Foi exatamente o que
 * aconteceu em produção quando o tema entrou. Há teste de regressão.
 */
export function cssDoTema(t: Tema): string {
  const c = t.cores;
  const e = t.coresEscuras;

  const claro = [
    `--ink: ${limpo(c.ink)};`,
    `--paper: ${limpo(c.paper)};`,
    `--red: ${limpo(c.red)};`,
    `--teal: ${limpo(c.teal)};`,
    `--teal-deep: ${limpo(c.tealEscuro)};`,
    `--dark: ${limpo(c.ink)};`,
    `--display: '${limpo(t.fontes.display)}', Impact, sans-serif;`,
    `--sans: '${limpo(t.fontes.corpo)}', system-ui, sans-serif;`,
  ].join("\n    ");

  // Só os tokens que o TEMA controla. Os demais (panel, line, muted, faint)
  // seguem vindo do globals.css, que já os define nos dois modos — sobrescrever
  // aqui só criaria uma segunda fonte pra eles.
  const escuro = [
    `--ink: ${limpo(e.ink)};`,
    `--paper: ${limpo(e.paper)};`,
    `--red: ${limpo(e.red)};`,
    `--dark: ${limpo(c.ink)};`,
  ].join("\n      ");

  return [
    `:root {`,
    `    ${claro}`,
    `  }`,
    `  @media (prefers-color-scheme: dark) {`,
    `    :root {`,
    `      ${escuro}`,
    `    }`,
    `  }`,
  ].join("\n  ");
}

/** Mescla o que veio do banco sobre o padrão, campo a campo. */
export function mesclaTema(parcial: unknown): Tema {
  const p = (parcial ?? {}) as Partial<Tema>;
  return {
    cores: { ...TEMA_PADRAO.cores, ...(p.cores ?? {}) },
    coresEscuras: { ...TEMA_PADRAO.coresEscuras, ...(p.coresEscuras ?? {}) },
    fontes: { ...TEMA_PADRAO.fontes, ...(p.fontes ?? {}) },
    logo: { ...TEMA_PADRAO.logo, ...(p.logo ?? {}) },
    textos: { ...TEMA_PADRAO.textos, ...(p.textos ?? {}) },
  };
}
