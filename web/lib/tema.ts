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
  cores: {
    ink: string;      // texto e superfície escura
    paper: string;    // fundo do portal
    red: string;      // acento da marca
    teal: string;     // faixa da arte
    tealEscuro: string;
  };
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

/** As variáveis CSS que o portal consome, prontas pra um bloco `:root`. */
export function cssDoTema(t: Tema): string {
  const c = t.cores;
  return [
    `--ink: ${limpo(c.ink)};`,
    `--paper: ${limpo(c.paper)};`,
    `--red: ${limpo(c.red)};`,
    `--teal: ${limpo(c.teal)};`,
    `--teal-deep: ${limpo(c.tealEscuro)};`,
    `--dark: ${limpo(c.ink)};`,
    `--display: '${limpo(t.fontes.display)}', Impact, sans-serif;`,
    `--sans: '${limpo(t.fontes.corpo)}', system-ui, sans-serif;`,
  ].join("\n  ");
}

/** Mescla o que veio do banco sobre o padrão, campo a campo. */
export function mesclaTema(parcial: unknown): Tema {
  const p = (parcial ?? {}) as Partial<Tema>;
  return {
    cores: { ...TEMA_PADRAO.cores, ...(p.cores ?? {}) },
    fontes: { ...TEMA_PADRAO.fontes, ...(p.fontes ?? {}) },
    logo: { ...TEMA_PADRAO.logo, ...(p.logo ?? {}) },
    textos: { ...TEMA_PADRAO.textos, ...(p.textos ?? {}) },
  };
}
