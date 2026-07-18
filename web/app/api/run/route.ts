import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";

// Dispara o pipeline (ou partes) e transmite a saída ao vivo pro admin.
// Protegido pelo middleware (custa dinheiro). Allowlist estrita de tarefas.
export const dynamic = "force-dynamic";
const ROOT = path.resolve(process.cwd(), "..");
const JOBS = path.join(ROOT, "jobs");

// task → argumentos do `python -m ...` (nada vem cru do cliente)
function buildArgs(task: string, opts: { max?: number; slug?: string; tema?: string }): string[] | null {
  const max = Math.min(Math.max(Number(opts.max) || 2, 1), 10);
  const slug = /^[a-z0-9-]{1,80}$/.test(opts.slug || "") ? opts.slug! : "";
  const tema = (opts.tema || "").slice(0, 80).replace(/[^\p{L}\p{N} -]/gu, "");
  switch (task) {
    case "fase_a": return ["-m", "orchestrator.phase_a", "--max", String(max)];
    case "fase_a_free": return ["-m", "orchestrator.phase_a", "--free", "--limit", "25"];
    case "carrossel": return slug ? ["-m", "orchestrator.build_carousel", slug] : null;
    case "plataformas": return slug ? ["-m", "orchestrator.build_platforms", slug] : null;
    case "atletas": return ["-m", "orchestrator.enrich_athlete", "--max", String(max)];
    case "produtos": return ["-m", "orchestrator.find_products", "--max", String(max)];
    case "curso": return tema ? ["-m", "orchestrator.build_course", "--tema", tema] : null;
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const args = buildArgs(String(body.task || ""), body);
  if (!args) return NextResponse.json({ error: "tarefa inválida ou faltam parâmetros" }, { status: 400 });

  const runId = Date.now().toString(36);
  fs.mkdirSync(JOBS, { recursive: true });
  const logPath = path.join(JOBS, `run-${runId}.log`);
  const log = fs.createWriteStream(logPath, { flags: "a" });
  log.write(`$ python ${args.join(" ")}\n`);

  const child = spawn("python", args, {
    cwd: ROOT,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
  });
  child.stdout.on("data", (d) => log.write(d));
  child.stderr.on("data", (d) => log.write(d));
  child.on("close", (code) => { log.write(`\n[[DONE exit=${code}]]\n`); log.end(); });
  child.on("error", (e) => { log.write(`\n[[DONE erro=${e.message}]]\n`); log.end(); });

  return NextResponse.json({ runId });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9]+$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const logPath = path.join(JOBS, `run-${id}.log`);
  if (!fs.existsSync(logPath)) return NextResponse.json({ log: "", done: false });
  const text = fs.readFileSync(logPath, "utf-8");
  const done = text.includes("[[DONE");
  return NextResponse.json({ log: text, done });
}
