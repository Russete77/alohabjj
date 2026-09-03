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

// ── Publicação criada do zero ─────────────────────────────────────────────
// Todo dossiê até aqui nascia do pipeline (RSS ou backfill), e a lista é
// montada A PARTIR DO DISCO com o banco por cima. Um post criado só no banco
// não teria artefato em disco e simplesmente não apareceria.

import { dossieDoBanco, gerarSlug, slugLivre } from "../cms.ts";

test("slug sai do título, sem acento e sem pontuação", () => {
  assert.equal(gerarSlug("Gordon Ryan vs Felipe Pena: a final do ADCC!"),
               "gordon-ryan-vs-felipe-pena-a-final-do-adcc");
});

test("slug colapsa espaço e hífen repetidos", () => {
  assert.equal(gerarSlug("  Análise   —   Mundial  2026 "), "analise-mundial-2026");
});

test("slug tem teto de tamanho e não termina em hífen", () => {
  const s = gerarSlug("palavra ".repeat(40));
  assert.ok(s.length <= 80);
  assert.ok(!s.endsWith("-"));
});

test("título só com símbolos não gera slug vazio", () => {
  const s = gerarSlug("!!! ??? ---");
  assert.ok(s.length > 0, "slug vazio viraria rota quebrada");
});

test("slug repetido ganha sufixo em vez de sobrescrever", () => {
  const usados = new Set(["mundial-2026", "mundial-2026-2"]);
  assert.equal(slugLivre("Mundial 2026", usados), "mundial-2026-3");
});

test("dossiê do banco vira item da lista, sem disco", () => {
  const d = dossieDoBanco({
    slug: "post-manual", titulo: "Post Manual", categoria: "noticias",
    data: "2026-09-03", resumo_editado: "Primeiro.\n\nSegundo.",
    imagem_editada: "https://cdn/x.jpg", status: "validated",
  });
  assert.equal(d.slug, "post-manual");
  assert.equal(d.categoriaLabel, "Notícias");
  assert.deepEqual(d.resumoParas, ["Primeiro.", "Segundo."]);
  assert.equal(d.imagem, "https://cdn/x.jpg");
  assert.equal(d.confianca, "alta");
});

test("dossiê manual sem corpo ainda é válido — é rascunho em branco", () => {
  const d = dossieDoBanco({ slug: "vazio", titulo: "Vazio", status: "validated" });
  assert.deepEqual(d.resumoParas, []);
  assert.equal(d.categoria, "noticias");
});

test("dossiê manual não carrega tag de bloqueio por acidente", () => {
  // confiança "alta" e sem tags: quem escreveu foi um humano, não a apuração
  const d = dossieDoBanco({ slug: "x", titulo: "X", status: "validated" });
  assert.deepEqual(d.tags, []);
});
