/**
 * Contrato entre `/api/agents/activity` (produtor) e o Console ao vivo (consumidor).
 *
 * Fica aqui, e não dentro do `route.ts`, porque um arquivo de rota do App Router
 * só pode exportar os handlers e um punhado de opções conhecidas — qualquer outro
 * export (mesmo de tipo) entra na checagem que o Next gera em `.next/types` e
 * vira erro de build. Com o contrato num módulo neutro, os dois lados usam a
 * MESMA definição e o TypeScript avisa quando um dos lados mudar sozinho.
 */

/**
 * Como a etapa está agora. Os três primeiros espelham os `status` do JSONL.
 *
 * "interrompido" não existe no log — é deduzido: uma etapa ficou em `running` e
 * o run inteiro parou de escrever. Ninguém gravou o fim dela, ou seja, o
 * processo morreu no meio (crash, `Ctrl+C`, teto de gasto). Mostrar isso como
 * "rodando" seria mentira; é justamente o caso que o operador precisa ver.
 */
export type Estado = "rodando" | "feito" | "erro" | "interrompido";

/** Uma linha do console: a situação atual de uma etapa do pipeline. */
export interface Etapa {
  /** Nome cru da etapa no JSONL (`step`). É a chave estável — nunca traduzida. */
  step: string;
  /** Rótulo legível. Cai no `step` cru quando a etapa é nova e ainda não tem nome. */
  rotulo: string;
  estado: Estado;
  /** Slug / chave do item sendo processado (ex.: o dossiê). */
  chave: string;
  /** Modelo usado. Em etapas sem IA (scraping, render) vem o serviço, ou "". */
  modelo: string;
  /** Custo estimado em USD desta ocorrência (0 quando ainda está rodando). */
  custo: number;
  /** Segundos desde o último evento desta etapa, medidos NO SERVIDOR. */
  idadeSeg: number;
  /** Duração em segundos: `t1-t0` quando terminou, `agora-t0` enquanto roda. */
  duracaoSeg: number | null;
  runId: string;
}

/** Uma falha no escopo em foco. Separada das etapas porque um erro não pode sumir
 *  só porque a mesma etapa depois deu certo com outra chave. */
export interface Falha {
  step: string;
  rotulo: string;
  chave: string;
  erro: string;
  idadeSeg: number;
}

export interface Atividade {
  /** true = tem evento nos últimos minutos, o pipeline está rodando agora. */
  aoVivo: boolean;
  /** "vivo" = run em andamento; "ultimo" = nada rodando, mostrando o run anterior;
   *  "vazio" = não há nenhum run recente pra mostrar. */
  modo: "vivo" | "ultimo" | "vazio";
  /** Run em foco (o mais recente do escopo). */
  runId: string | null;
  /** Soma de `cost_est` das etapas em foco, em USD. */
  custo: number;
  etapas: Etapa[];
  falhas: Falha[];
  /** Janela, em segundos, que define "ao vivo" — o console mostra pro operador. */
  janelaVivaSeg: number;
}
