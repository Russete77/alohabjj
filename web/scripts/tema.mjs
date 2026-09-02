// O tema para os renderizadores de imagem.
//
// Os três (slides, story, story 9x16) tinham cada um a SUA cópia da paleta e
// das frases — "SIGA PARA MAIS BJJ" estava escrito na mão em cada arquivo.
// Trocar a cor da marca exigia achar e editar os três, e nada garantia que
// ficassem iguais.
//
// Lê o mesmo `config/tema.json` que o portal usa. Como estes scripts rodam
// fora do Next, buscam do Supabase direto; sem credencial ou sem rede, caem no
// arquivo do disco e depois no padrão. Arte com a cor errada é ruim; arte que
// não sai é pior.
import { readFileSync } from "node:fs";
import path from "node:path";

const PADRAO = {
  cores: { ink: "#0B0B0C", paper: "#F5F3EF", red: "#D8232A", teal: "#1A9CB4", tealEscuro: "#16879C" },
  fontes: { display: "Anton", corpo: "Inter" },
  logo: { portal: null, arte: null, recorte: null },
  textos: {
    ticker: "Cobertura ao vivo · Mundial IBJJF · ADCC · resultados, superlutas e análises · @bjjcomlucas",
    rodapeArte: "SIGA PARA MAIS BJJ",
    assinatura: "@BJJCOMLUCAS",
    dominioArte: "ALOHABJJNEWS.COM",
  },
};

function mescla(p) {
  const o = p || {};
  return {
    cores: { ...PADRAO.cores, ...(o.cores || {}) },
    fontes: { ...PADRAO.fontes, ...(o.fontes || {}) },
    logo: { ...PADRAO.logo, ...(o.logo || {}) },
    textos: { ...PADRAO.textos, ...(o.textos || {}) },
  };
}

export async function carregaTema(raiz = path.resolve("..")) {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (url && key) {
    try {
      const r = await fetch(
        `${url}/rest/v1/app_config?path=eq.config%2Ftema.json&select=conteudo`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) },
      );
      if (r.ok) {
        const linhas = await r.json();
        if (linhas.length) return mescla(JSON.parse(linhas[0].conteudo));
      }
    } catch { /* sem rede: cai no disco */ }
  }
  try {
    return mescla(JSON.parse(readFileSync(path.join(raiz, "config", "tema.json"), "utf-8")));
  } catch {
    return PADRAO;
  }
}
