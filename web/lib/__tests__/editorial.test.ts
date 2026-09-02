import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicaEstado,
  contaDestaques,
  ehCategoria,
  normalizaOrdem,
  normalizaTitulo,
  ordenaAdmin,
  ordenaVitrine,
  slugSeguro,
  type ItemEditorial,
} from "../editorial.ts";

/** Um dossiê como sai do arquivo: categoria adivinhada, sem estado editorial. */
function doArquivo(over: Partial<ItemEditorial> = {}): ItemEditorial {
  return {
    slug: "gordon-vs-buchecha",
    titulo: "Gordon vs Buchecha",
    categoria: "superlutas",
    categoriaLabel: "Superlutas",
    data: "2026-08-01",
    ...over,
  };
}

// ── Precedência banco-vence-arquivo ────────────────────────────────────────

test("banco corrige a categoria adivinhada", () => {
  const d = aplicaEstado(doArquivo(), { categoria: "tecnica" });
  assert.equal(d.categoria, "tecnica");
});

test("o rótulo acompanha a categoria corrigida", () => {
  // o bug: espalhar o estado por cima do arquivo trocava `categoria` mas
  // deixava `categoriaLabel` velho, e a home mostrava "Superlutas" num item
  // que o operador tinha movido pra Técnica.
  const d = aplicaEstado(doArquivo(), { categoria: "tecnica" });
  assert.equal(d.categoriaLabel, "Técnica");
});

test("categoria inválida no banco não vence — fica a do arquivo", () => {
  const d = aplicaEstado(doArquivo(), { categoria: "esportes" });
  assert.equal(d.categoria, "superlutas");
  assert.equal(d.categoriaLabel, "Superlutas");
});

test("categoria nula no banco não apaga a do arquivo", () => {
  const d = aplicaEstado(doArquivo(), { categoria: null });
  assert.equal(d.categoria, "superlutas");
});

test("banco corrige o título", () => {
  const d = aplicaEstado(doArquivo(), { titulo: "Gordon Ryan x Buchecha" });
  assert.equal(d.titulo, "Gordon Ryan x Buchecha");
});

test("título vazio no banco não deixa a home sem manchete", () => {
  assert.equal(aplicaEstado(doArquivo(), { titulo: "   " }).titulo, "Gordon vs Buchecha");
  assert.equal(aplicaEstado(doArquivo(), { titulo: null }).titulo, "Gordon vs Buchecha");
});

test("slug que o banco não conhece fica sem status — fora do ar", () => {
  // falhar fechado: dossiê no disco sem linha no banco não é publicado
  const d = aplicaEstado(doArquivo(), undefined);
  assert.equal(d.status, undefined);
  assert.equal(d.arquivado, false);
  assert.equal(d.destaque, false);
  assert.equal(d.ordem, null);
});

test("estado do arquivo nunca sobrevive ao do banco", () => {
  // um snapshot velho pode trazer status=published; o banco manda despublicar
  const d = aplicaEstado(doArquivo({ status: "published", destaque: true }), {
    status: "validated",
    destaque: false,
  });
  assert.equal(d.status, "validated");
  assert.equal(d.destaque, false);
});

test("ordem só vence quando é número", () => {
  assert.equal(aplicaEstado(doArquivo(), { ordem: 3 }).ordem, 3);
  assert.equal(aplicaEstado(doArquivo(), { ordem: 0 }).ordem, 0);
  assert.equal(aplicaEstado(doArquivo(), { ordem: null }).ordem, null);
});

// ── Ordenação da vitrine ───────────────────────────────────────────────────

const vitrine: ItemEditorial[] = [
  doArquivo({ slug: "c", data: "2026-08-03" }),
  doArquivo({ slug: "a", data: "2026-08-01", destaque: true }),
  doArquivo({ slug: "b", data: "2026-08-02", ordem: 1 }),
];

test("destaque vem antes de tudo, mesmo sendo o mais antigo", () => {
  assert.equal(ordenaVitrine(vitrine)[0].slug, "a");
});

test("ordem manual vence data", () => {
  assert.deepEqual(ordenaVitrine(vitrine).map((d) => d.slug), ["a", "b", "c"]);
});

test("sem ordem manual cai pra data, mais recente primeiro", () => {
  const l = ordenaVitrine([
    doArquivo({ slug: "velho", data: "2026-01-01" }),
    doArquivo({ slug: "novo", data: "2026-09-01" }),
  ]);
  assert.deepEqual(l.map((d) => d.slug), ["novo", "velho"]);
});

test("empate total desempata por slug — a home não pode pular sozinha", () => {
  const l = ordenaVitrine([doArquivo({ slug: "z" }), doArquivo({ slug: "a" })]);
  assert.deepEqual(l.map((d) => d.slug), ["a", "z"]);
});

test("ordenaVitrine não mexe na lista recebida", () => {
  const orig = [...vitrine];
  ordenaVitrine(vitrine);
  assert.deepEqual(vitrine, orig);
});

test("admin ignora destaque e ordem — só data", () => {
  assert.deepEqual(ordenaAdmin(vitrine).map((d) => d.slug), ["c", "b", "a"]);
});

// ── Normalização dos campos da tela ────────────────────────────────────────

test("campo de ordem vazio vira null, não zero", () => {
  // zero jogaria o item pro topo da home sem ninguém pedir
  assert.equal(normalizaOrdem(""), null);
  assert.equal(normalizaOrdem("   "), null);
  assert.equal(normalizaOrdem(null), null);
  assert.equal(normalizaOrdem(undefined), null);
});

test("campo de ordem aceita inteiro e trunca decimal", () => {
  assert.equal(normalizaOrdem("2"), 2);
  assert.equal(normalizaOrdem(" 10 "), 10);
  assert.equal(normalizaOrdem("2.9"), 2);
  assert.equal(normalizaOrdem("-1"), -1);
});

test("ordem com lixo ou fora do int4 vira null", () => {
  assert.equal(normalizaOrdem("primeiro"), null);
  assert.equal(normalizaOrdem("9999999999"), null);
  assert.equal(normalizaOrdem(Infinity), null);
});

test("título é colapsado e limitado", () => {
  assert.equal(normalizaTitulo("  Gordon   vs\n Buchecha "), "Gordon vs Buchecha");
  assert.equal(normalizaTitulo("x".repeat(400)).length, 300);
  assert.equal(normalizaTitulo(null), "");
});

test("só as 4 editorias são categoria", () => {
  for (const c of ["superlutas", "noticias", "analises", "tecnica"]) {
    assert.equal(ehCategoria(c), true);
  }
  assert.equal(ehCategoria("Superlutas"), false);
  assert.equal(ehCategoria(""), false);
  assert.equal(ehCategoria(null), false);
});

test("conta destaques pra avisar quando passa de 3", () => {
  assert.equal(contaDestaques(vitrine), 1);
  assert.equal(contaDestaques([]), 0);
});

// ── Slug: a única trava entre um formulário e um rm -rf ────────────────────

test("slug com travessia de caminho é recusado", () => {
  assert.equal(slugSeguro("../../etc"), false);
  assert.equal(slugSeguro("a/b"), false);
  assert.equal(slugSeguro("a\\b"), false);
  assert.equal(slugSeguro(".."), false);
  assert.equal(slugSeguro(""), false);
  assert.equal(slugSeguro("MAIUSCULA"), false);
  assert.equal(slugSeguro("-comeca-com-hifen"), false);
  assert.equal(slugSeguro(null), false);
});

test("slug normal passa", () => {
  assert.equal(slugSeguro("gordon-vs-buchecha-2026"), true);
});
