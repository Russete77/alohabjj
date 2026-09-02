import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicaEdicao, normalizaTagLivre, parseParagrafos, vocabularioDeTags,
} from "../cms.ts";

const base = {
  slug: "luta-x",
  resumoParas: ["Do arquivo, um.", "Do arquivo, dois."],
  imagem: "/hero/luta-x.jpg",
  tags: ["gi"],
};

test("sem edição, vale o arquivo", () => {
  const d = aplicaEdicao(base, {});
  assert.deepEqual(d.resumoParas, ["Do arquivo, um.", "Do arquivo, dois."]);
  assert.equal(d.imagem, "/hero/luta-x.jpg");
  assert.equal(d.editado, false);
});

test("corpo editado vence o arquivo", () => {
  const d = aplicaEdicao(base, { resumo_editado: "Corrigido pelo operador.\n\nSegundo." });
  assert.deepEqual(d.resumoParas, ["Corrigido pelo operador.", "Segundo."]);
  assert.equal(d.editado, true);
});

test("capa trocada vence a do arquivo", () => {
  const d = aplicaEdicao(base, { imagem_editada: "https://cdn/nova.jpg" });
  assert.equal(d.imagem, "https://cdn/nova.jpg");
});

test("null é 'não editado', não 'apagado'", () => {
  const d = aplicaEdicao(base, { resumo_editado: null, imagem_editada: null });
  assert.deepEqual(d.resumoParas, ["Do arquivo, um.", "Do arquivo, dois."]);
  assert.equal(d.imagem, "/hero/luta-x.jpg");
});

test("string vazia é apagado de propósito, e não volta pro arquivo", () => {
  // desfazer a edição é gravar null; salvar em branco é uma decisão diferente
  const d = aplicaEdicao(base, { resumo_editado: "" });
  assert.deepEqual(d.resumoParas, []);
  assert.equal(d.editado, true);
});

test("tags do banco vencem as do arquivo quando existem", () => {
  const d = aplicaEdicao(base, { tags: ["no-gi", "leg-lock"] });
  assert.deepEqual(d.tags, ["no-gi", "leg-lock"]);
});

test("lista de tags vazia no banco não apaga as do arquivo por engano", () => {
  // nenhuma linha em dossier_tags = nunca editado, não = "removi todas"
  const d = aplicaEdicao(base, { tags: [] });
  assert.deepEqual(d.tags, ["gi"]);
});

test("parágrafos separam por linha em branco e colapsam espaço", () => {
  assert.deepEqual(parseParagrafos("Um   texto.\n\n\nOutro\nno mesmo."),
                   ["Um texto.", "Outro no mesmo."]);
});

test("título markdown do topo é descartado", () => {
  assert.deepEqual(parseParagrafos("# Luta X\n\nCorpo."), ["Corpo."]);
});

test("tag livre vira o mesmo formato do resto do sistema", () => {
  assert.equal(normalizaTagLivre("  No-Gi  "), "no-gi");
  assert.equal(normalizaTagLivre("Leg Lock"), "leg-lock");
  assert.equal(normalizaTagLivre("Técnica"), "tecnica");
});

test("vocabulário junta, conta e ordena por uso", () => {
  const v = vocabularioDeTags([
    { tags: ["gi", "ibjjf"] }, { tags: ["gi", "no-gi"] }, { tags: ["gi"] },
  ]);
  assert.deepEqual(v.slice(0, 2), [{ tag: "gi", usos: 3 }, { tag: "ibjjf", usos: 1 }]);
});

test("vocabulário normaliza antes de contar — nogi e No-Gi são a mesma tag", () => {
  const v = vocabularioDeTags([{ tags: ["No-Gi"] }, { tags: ["no-gi"] }, { tags: ["NO-GI"] }]);
  assert.deepEqual(v, [{ tag: "no-gi", usos: 3 }]);
});
