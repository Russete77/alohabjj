import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { lerConfig, salvarConfig } from "./config-store";

// Edição de config pelo /admin: prompts dos agentes (agents/*/system.md),
// docs de config (config/*.md) e chaves do .env. O pipeline Python lê esses
// arquivos a cada run, então a edição já vale no próximo ciclo.
const ROOT = path.resolve(process.cwd(), "..");
const AGENTS = path.join(ROOT, "agents");
const CONFIG = path.join(ROOT, "config");
const CONFIG_DOCS = ["voz.md", "regras.md", "bjj-visual.md"];

export interface Doc { kind: "agent" | "config"; name: string; content: string }

export async function listDocs(): Promise<Doc[]> {
  const docs: Doc[] = [];
  if (fs.existsSync(AGENTS)) {
    for (const d of fs.readdirSync(AGENTS, { withFileTypes: true })) {
      const f = path.join(AGENTS, d.name, "system.md");
      if (d.isDirectory() && fs.existsSync(f)) {
        const conteudo = await lerConfig(`agents/${d.name}/system.md`);
        if (conteudo !== null) docs.push({ kind: "agent", name: d.name, content: conteudo });
      }
    }
  }
  for (const name of CONFIG_DOCS) {
    const f = path.join(CONFIG, name);
    const conteudo = await lerConfig(`config/${name}`);
    if (conteudo !== null) docs.push({ kind: "config", name, content: conteudo });
  }
  return docs;
}

export async function writeDoc(
  kind: "agent" | "config", name: string, content: string,
): Promise<void> {
  const p =
    kind === "agent"
      ? (() => {
          if (!/^[a-z0-9_]+$/.test(name)) throw new Error("nome de agente inválido");
          if (!fs.existsSync(path.join(AGENTS, name))) throw new Error("agente não existe");
          return `agents/${name}/system.md`;
        })()
      : (() => {
          if (!CONFIG_DOCS.includes(name)) throw new Error("doc de config inválido");
          return `config/${name}`;
        })();

  const r = await salvarConfig(p, content);
  if (!r.ok) throw new Error(r.erro);
}

// Config YAML bruta editável no painel (fontes RSS etc). Valida o YAML antes de salvar
// pra não corromper o arquivo que o pipeline Python lê.
const RAW_CONFIGS = ["fontes.yaml"];

export async function readRawConfig(name: string): Promise<string> {
  if (!RAW_CONFIGS.includes(name)) throw new Error("config inválida");
  return (await lerConfig(`config/${name}`)) ?? "";
}

export async function writeRawConfig(name: string, content: string): Promise<void> {
  if (!RAW_CONFIGS.includes(name)) throw new Error("config inválida");
  try {
    parseYaml(content); // valida — YAML quebrado derruba o Radar no dia seguinte
  } catch (e) {
    throw new Error("YAML inválido: " + (e as Error).message);
  }
  const r = await salvarConfig(`config/${name}`, content);
  if (!r.ok) throw new Error(r.erro);
}

// writeEnvKey foi REMOVIDA nesta fase.
//
// Ela reescrevia o .env em disco — que não existe na Vercel. E a linha certa,
// agora, é outra: chave de PROVEDOR (que gasta dinheiro na conta de alguém)
// mora no ambiente e o painel só mostra se está setada; ajuste de NEGÓCIO
// (teto, modelo do scout, tag de afiliado) mora em app_settings e é editável.
// Ver web/lib/config-store.ts.
