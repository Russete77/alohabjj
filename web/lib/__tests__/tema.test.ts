import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMA_PADRAO, contraste, cssDoTema, temaValido } from "../tema.ts";

test("tema padrão é válido", () => {
  assert.deepEqual(temaValido(TEMA_PADRAO).erros, []);
});

test("cor fora do formato é recusada com o campo no erro", () => {
  const r = temaValido({ ...TEMA_PADRAO, cores: { ...TEMA_PADRAO.cores, red: "vermelho" } });
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /red/);
});

test("aceita hex de 3 e de 6 dígitos", () => {
  assert.deepEqual(temaValido({ ...TEMA_PADRAO, cores: { ...TEMA_PADRAO.cores, red: "#f00" } }).erros, []);
});

test("texto vazio é recusado — a arte ficaria com um buraco", () => {
  const r = temaValido({ ...TEMA_PADRAO, textos: { ...TEMA_PADRAO.textos, assinatura: "  " } });
  assert.match(r.erros[0], /assinatura/);
});

test("contraste calcula a razão WCAG", () => {
  assert.equal(Math.round(contraste("#000000", "#ffffff")), 21);
  assert.equal(Math.round(contraste("#ffffff", "#ffffff")), 1);
});

test("texto ilegível sobre o fundo vira erro, não aviso", () => {
  // O operador escolhe cor num seletor bonito e não tem como saber que o
  // resultado é ilegível. O sistema tem.
  const r = temaValido({
    ...TEMA_PADRAO,
    cores: { ...TEMA_PADRAO.cores, ink: "#eeeeee", paper: "#ffffff" },
  });
  assert.ok(r.erros.some((e) => /contraste/i.test(e)));
});

test("cssDoTema emite as variáveis que o portal usa", () => {
  const css = cssDoTema(TEMA_PADRAO);
  assert.match(css, /--ink:\s*#0B0B0C/);
  assert.match(css, /--red:\s*#D8232A/);
  assert.match(css, /--display:/);
});

test("cssDoTema escapa aspas — tema é dado de entrada, não código", () => {
  const css = cssDoTema({
    ...TEMA_PADRAO,
    fontes: { ...TEMA_PADRAO.fontes, display: 'Anton";}</style><script>x' },
  });
  assert.ok(!css.includes("</style>"));
  assert.ok(!css.includes("<script"));
});

// ── Regressão: o tema não pode matar o modo escuro ────────────────────────
// O bloco injetado no layout vem DEPOIS do globals.css, com a mesma
// especificidade — então ele vence o @media (prefers-color-scheme: dark) que já
// existia. Sem emitir o bloco escuro junto, o portal fica preso no claro e
// ignora a preferência do sistema. Foi o que aconteceu em produção.

test("cssDoTema emite o bloco de tema escuro", () => {
  const css = cssDoTema(TEMA_PADRAO);
  assert.match(css, /@media \(prefers-color-scheme:\s*dark\)/);
});

test("no escuro, a tinta e o papel invertem", () => {
  const css = cssDoTema(TEMA_PADRAO);
  const escuro = css.split("prefers-color-scheme")[1];
  assert.match(escuro, /--ink:\s*#F4F1EE/i);
  assert.match(escuro, /--paper:\s*#121110/i);
});

test("trocar a cor no claro não apaga o escuro", () => {
  const css = cssDoTema({ ...TEMA_PADRAO, cores: { ...TEMA_PADRAO.cores, red: "#1B7F3B" } });
  const [claro, escuro] = css.split("@media");
  assert.match(claro, /--red:\s*#1B7F3B/);
  assert.match(escuro, /--red:/); // o escuro tem o SEU vermelho, não some
});

test("o contraste do tema escuro também é validado", () => {
  const r = temaValido({
    ...TEMA_PADRAO,
    coresEscuras: { ...TEMA_PADRAO.coresEscuras, ink: "#1a1a1a" }, // quase igual ao fundo
  });
  assert.ok(r.erros.some((e) => /escuro/i.test(e)));
});
