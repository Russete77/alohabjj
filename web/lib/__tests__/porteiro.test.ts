import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, normalizaTag, podeIrAoAr } from "../porteiro.ts";

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
