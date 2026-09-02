import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "senha-de-teste";
process.env.ADMIN_SESSION_SECRET = "segredo-longo-de-teste-1234567890";

const { issueSession, verifySession, checkPassword } = await import("../auth.ts");

test("sessão recém-emitida vale", async () => {
  assert.equal(await verifySession(await issueSession()), true);
});

test("sessão expirada não vale", async () => {
  const t = await issueSession(1000);
  assert.equal(await verifySession(t, Date.now() + 2000), false);
});

test("assinatura adulterada não vale", async () => {
  const t = await issueSession();
  const [exp, sig] = t.split(".");
  assert.equal(await verifySession(`${exp}.${sig.slice(0, -2)}xx`), false);
});

test("expiração adulterada não vale", async () => {
  const t = await issueSession(1000);
  const sig = t.split(".")[1];
  assert.equal(await verifySession(`${Date.now() + 999_999}.${sig}`), false);
});

test("cookie ausente ou malformado não vale", async () => {
  assert.equal(await verifySession(undefined), false);
  assert.equal(await verifySession(""), false);
  assert.equal(await verifySession("sem-ponto"), false);
});

test("senha certa passa, errada não", () => {
  assert.equal(checkPassword("senha-de-teste"), true);
  assert.equal(checkPassword("senha-de-test"), false);
  assert.equal(checkPassword(""), false);
});
