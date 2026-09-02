import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, normalizaData, normalizaTag, podeIrAoAr } from "../porteiro.ts";

test("normaliza tira acento e espaço", () => {
  assert.equal(normalizaTag("tema sensível"), "tema-sensivel");
});

test("normaliza troca underscore por hífen", () => {
  assert.equal(normalizaTag("nao_confirmado"), "nao-confirmado");
});

test("tag acentuada bloqueia", () => {
  assert.equal(
    motivoBloqueio({ confianca: "media", tags: ["notícia", "tema sensível"] }),
    "tag de bloqueio: tema sensível",
  );
});

test("confiança baixa bloqueia", () => {
  assert.equal(motivoBloqueio({ confianca: "baixa", tags: [] }), "confiança baixa");
});

test("dossiê limpo não bloqueia", () => {
  assert.equal(motivoBloqueio({ confianca: "media", tags: ["gi"] }), null);
});

test("só published vai ao ar", () => {
  assert.equal(podeIrAoAr({ status: "published", arquivado: false }), true);
  assert.equal(podeIrAoAr({ status: "validated", arquivado: false }), false);
});

test("arquivado nunca vai ao ar, mesmo publicado", () => {
  assert.equal(podeIrAoAr({ status: "published", arquivado: true }), false);
});

test("falha fechado: sem status, não vai ao ar", () => {
  assert.equal(podeIrAoAr({}), false);
});

test("data RFC-822 vira ISO", () => {
  // cortar 10 chars dava "Wed, 22 Ap", que ordena acima de qualquer data ISO
  assert.equal(normalizaData("Wed, 22 Apr 2026 11:44:44 +0000"), "2026-04-22");
});

test("data ISO com hora é cortada", () => {
  assert.equal(normalizaData("2026-07-17T16:32:07+00:00"), "2026-07-17");
});

test("data vazia ou lixo vira string vazia", () => {
  assert.equal(normalizaData(""), "");
  assert.equal(normalizaData("qualquer coisa"), "");
  assert.equal(normalizaData(null), "");
});
