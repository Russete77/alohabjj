import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Edição de config pelo /admin: prompts dos agentes (agents/*/system.md),
// docs de config (config/*.md) e chaves do .env. O pipeline Python lê esses
// arquivos a cada run, então a edição já vale no próximo ciclo.
const ROOT = path.resolve(process.cwd(), "..");
const AGENTS = path.join(ROOT, "agents");
const CONFIG = path.join(ROOT, "config");
const ENV = path.join(ROOT, ".env");
const CONFIG_DOCS = ["voz.md", "regras.md", "bjj-visual.md"];
const SECRET = /(KEY|SECRET|TOKEN|PASSWORD)/i;

export interface Doc { kind: "agent" | "config"; name: string; content: string }
export interface EnvVar { key: string; secret: boolean; set: boolean; value: string }

export function listDocs(): Doc[] {
  const docs: Doc[] = [];
  if (fs.existsSync(AGENTS)) {
    for (const d of fs.readdirSync(AGENTS, { withFileTypes: true })) {
      const f = path.join(AGENTS, d.name, "system.md");
      if (d.isDirectory() && fs.existsSync(f)) {
        docs.push({ kind: "agent", name: d.name, content: fs.readFileSync(f, "utf-8") });
      }
    }
  }
  for (const name of CONFIG_DOCS) {
    const f = path.join(CONFIG, name);
    if (fs.existsSync(f)) docs.push({ kind: "config", name, content: fs.readFileSync(f, "utf-8") });
  }
  return docs;
}

export function writeDoc(kind: "agent" | "config", name: string, content: string): void {
  if (kind === "agent") {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error("nome de agente inválido");
    const f = path.join(AGENTS, name, "system.md");
    if (!fs.existsSync(path.dirname(f))) throw new Error("agente não existe");
    fs.writeFileSync(f, content, "utf-8");
  } else {
    if (!CONFIG_DOCS.includes(name)) throw new Error("doc de config inválido");
    fs.writeFileSync(path.join(CONFIG, name), content, "utf-8");
  }
}

// Config YAML bruta editável no painel (fontes RSS etc). Valida o YAML antes de salvar
// pra não corromper o arquivo que o pipeline Python lê.
const RAW_CONFIGS = ["fontes.yaml"];

export function readRawConfig(name: string): string {
  if (!RAW_CONFIGS.includes(name)) throw new Error("config inválida");
  const f = path.join(CONFIG, name);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf-8") : "";
}

export function writeRawConfig(name: string, content: string): void {
  if (!RAW_CONFIGS.includes(name)) throw new Error("config inválida");
  try {
    parseYaml(content); // valida — lança se YAML inválido
  } catch (e) {
    throw new Error("YAML inválido: " + (e as Error).message);
  }
  fs.writeFileSync(path.join(CONFIG, name), content, "utf-8");
}

export function readEnv(): EnvVar[] {
  if (!fs.existsSync(ENV)) return [];
  const map = new Map<string, EnvVar>();
  for (const line of fs.readFileSync(ENV, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1], val = m[2];
    const secret = SECRET.test(key);
    map.set(key, { key, secret, set: val.trim().length > 0, value: secret ? "" : val });
  }
  return [...map.values()];
}

export function writeEnvKey(key: string, value: string): void {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error("chave inválida");
  if (value.includes("\n")) throw new Error("valor inválido");
  let lines = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf-8").split("\n") : [];
  let found = false;
  lines = lines.map((l) => {
    const m = l.match(/^([A-Z0-9_]+)=/);
    if (m && m[1] === key) { found = true; return `${key}=${value}`; }
    return l;
  });
  if (!found) lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV, lines.join("\n"), "utf-8");
}
