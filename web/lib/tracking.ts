import fs from "node:fs";
import path from "node:path";
import { after } from "next/server";
import { dbEnabled, dbInsert, dbSelect } from "@/lib/server-db";

// ═══════════════════════════════════════════════════════════════════════════
// Tracking de conversão — GRAVAÇÃO (rotas /r, /k, /p) e LEITURA (painel).
//
// Antes isto vivia em tracking/events.jsonl, um arquivo no disco. Na Vercel o
// disco é efêmero: o clique era gravado e sumia no fim da invocação. O painel
// lia o mesmo arquivo e por isso mostrava zero pra sempre, e o Supervisor de
// Vendas aprendia do mesmo arquivo e por isso nunca aprendia nada.
//
// Agora o destino é a tabela `events` do Supabase. Uma regra que vale pros dois
// lados: HÁ EXATAMENTE UM DESTINO POR VEZ — com credencial, o banco; sem
// credencial (dev local), o arquivo. Nunca os dois, senão o mesmo clique
// entraria duas vezes na conta de quem lê.
// ═══════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(process.cwd(), "..");
const EVENTS = path.join(ROOT, "tracking", "events.jsonl");
const OUTPUTS = path.join(ROOT, "outputs");

// Teto de leitura do painel. O PostgREST não faz group-by sem uma view/RPC, então
// a agregação é em JS — e uma agregação em JS precisa de um teto explícito, senão
// no dia em que a tabela crescer o painel puxa a tabela inteira pra memória.
// Os mais recentes primeiro (idx_events_occurred cobre a ordenação).
const TETO_LEITURA = 5000;

export interface Ev { ts: number; event_type: string; piece: string; product_id: string; value?: number }
export interface ProdStat { product: string; clicks: number; conversions: number; value: number; cvr: number }
export interface PieceStat { piece: string; titulo: string; produto: string; clicks: number; conversions: number }

// ─────────────────────────── GRAVAÇÃO ──────────────────────────────────────

export interface DadosClique {
  /** Chave da peça: slug do dossiê, "k:GI" (ManyChat) ou "loja:bjj3d". */
  piece: string;
  /** Categoria do catálogo (ex.: gi-competicao). NÃO é id de linha da loja. */
  produto?: string | null;
  /** De onde veio o clique: peca | manychat | loja. */
  source: string;
}

/**
 * Registra um clique. CONTRATO: best-effort e NUNCA bloqueia nem quebra o
 * redirect. Se o banco cair, o usuário chega no destino do mesmo jeito.
 *
 * Como o contrato é cumprido:
 *  • com banco: a escrita vai pro `after()` do Next, que roda DEPOIS da resposta
 *    sair. O 302 não espera o Supabase — nem por um milissegundo. (O dbInsert
 *    ainda tem timeout de 2,5s pra não segurar a função da Vercel depois disso.)
 *  • sem banco: append no arquivo, como sempre foi — o fluxo local continua de pé.
 *  • o corpo inteiro é try/catch: nem um erro de programação aqui dentro pode
 *    escapar pro handler e derrubar o redirect.
 */
export function registraClique(req: Request, d: DadosClique): void {
  try {
    const url = new URL(req.url);
    const qs = (k: string) => url.searchParams.get(k) || null;
    const referrer = req.headers.get("referer") || null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 200) || null;

    if (dbEnabled()) {
      after(async () => {
        await dbInsert("events", {
          event_type: "click",
          // product_id é TEXTO SOLTO desde a migração 2026-09-02-fase4-tracking.sql:
          // a FK pra products(id) foi derrubada porque products está vazia e a
          // categoria do catálogo nunca foi um id de loja. null quando não houver
          // produto — string vazia seria um id falso poluindo o group-by do painel.
          product_id: d.produto || null,
          source: d.source,
          // piece_id fica NULL de propósito. A coluna é UUID com FK pra pieces(id)
          // e o que temos aqui é um SLUG de texto — e em /k e /p nem sequer existe
          // peça ("k:GI" é palavra-chave do ManyChat, "loja:bjj3d" é produto da
          // loja). Resolver slug→UUID custaria uma consulta extra por clique pra
          // servir só um dos três casos. O slug vai em meta->>'piece', que é a
          // chave canônica de peça em todo mundo que lê (painel e Supervisor).
          meta: { piece: d.piece },
          tracked_url: url.pathname, // só o caminho: query string não vira depósito de dado
          utm_source: qs("utm_source"),
          utm_medium: qs("utm_medium"),
          utm_campaign: qs("utm_campaign"),
          utm_content: qs("utm_content"),
          referrer,
          user_agent: ua,
        });
      });
      return;
    }

    // Sem credencial (dev local): o arquivo continua sendo o destino, no MESMO
    // formato de sempre, pra que o lib/tracking.py e o painel local sigam lendo.
    const row = {
      ts: Date.now() / 1000,
      event_type: "click",
      piece: d.piece,
      product_id: d.produto || "",
      source: d.source,
      utm_source: qs("utm_source") || "",
      referrer: referrer || "",
      ua: ua || "",
    };
    fs.mkdirSync(path.dirname(EVENTS), { recursive: true });
    fs.appendFileSync(EVENTS, JSON.stringify(row) + "\n");
  } catch {
    /* clique perdido é barato; redirect preso é caro */
  }
}

// ─────────────────────────── LEITURA (painel) ──────────────────────────────

function readEvents(): Ev[] {
  if (!fs.existsSync(EVENTS)) return [];
  const out: Ev[] = [];
  for (const l of fs.readFileSync(EVENTS, "utf-8").split("\n")) {
    const s = l.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* ignore */ }
  }
  return out;
}

interface LinhaEvento {
  event_type: string;
  product_id: string | null;
  value: number | string | null;
  utm_content: string | null;
  meta: { piece?: string } | null;
}

/** Lê do banco e devolve no mesmo formato do arquivo. null = ERRO de leitura. */
async function readEventsDb(): Promise<Ev[] | null> {
  const linhas = await dbSelect<LinhaEvento>(
    "events?select=event_type,product_id,value,utm_content,meta" +
    `&order=occurred_at.desc&limit=${TETO_LEITURA}`,
  );
  // dbSelect devolve null em ERRO e [] quando não achou nada — os dois NÃO podem
  // virar a mesma coisa aqui, senão banco fora do ar viraria "sem dados ainda".
  if (linhas === null) return null;
  return linhas.map((l) => ({
    ts: 0, // o painel não usa timestamp; a ordem já vem do banco
    event_type: l.event_type,
    // utm_content como segunda opção: é onde o lib/tracking.py mandava a peça
    // antes desta fase. Nenhuma linha assim existe hoje (a tabela estava vazia),
    // mas ler as duas chaves é de graça e evita um buraco silencioso.
    piece: l.meta?.piece || l.utm_content || "",
    product_id: l.product_id || "",
    value: l.value == null ? undefined : Number(l.value),
  }));
}

function tituloDe(slug: string): string {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(OUTPUTS, slug, "meta.json"), "utf-8"));
    return m.dossie || slug;
  } catch {
    // Em produção a pasta outputs/ não é deployada junto com o web/, então o
    // título degrada pro slug. É legível e não custa uma consulta a mais.
    return slug;
  }
}

function agrega(evs: Ev[]) {
  const byProd = new Map<string, { clicks: number; conversions: number; value: number }>();
  const byPiece = new Map<string, { clicks: number; conversions: number; produto: string }>();
  let clicks = 0, conversions = 0, revenue = 0;
  for (const e of evs) {
    const pk = e.product_id || "—", sk = e.piece || "—";
    const p = byProd.get(pk) ?? { clicks: 0, conversions: 0, value: 0 };
    // O produto da peça vem do PRÓPRIO evento, não do meta.json em disco: assim a
    // coluna continua preenchida em produção, onde outputs/ não existe.
    const s = byPiece.get(sk) ?? { clicks: 0, conversions: 0, produto: e.product_id || "" };
    if (e.product_id && !s.produto) s.produto = e.product_id;
    if (e.event_type === "click") { p.clicks++; s.clicks++; clicks++; }
    else if (e.event_type === "conversion") {
      p.conversions++; s.conversions++; conversions++;
      p.value += Number(e.value || 0); revenue += Number(e.value || 0);
    }
    byProd.set(pk, p); byPiece.set(sk, s);
  }
  const products: ProdStat[] = [...byProd.entries()]
    .map(([product, v]) => ({ product, ...v, cvr: v.clicks ? (v.conversions / v.clicks) * 100 : 0 }))
    .sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
  const pieces: PieceStat[] = [...byPiece.entries()]
    .map(([piece, v]) => ({ piece, titulo: tituloDe(piece), produto: v.produto, clicks: v.clicks, conversions: v.conversions }))
    .sort((a, b) => b.clicks - a.clicks).slice(0, 12);
  return { products, pieces, totals: { clicks, conversions, revenue, cvr: clicks ? (conversions / clicks) * 100 : 0 } };
}

/**
 * Agrega pro painel. Com credencial lê do banco; sem credencial, do arquivo.
 *
 * `erro: true` significa "não consegui LER o banco" — é diferente de "não há
 * dado ainda", e o painel precisa dizer coisas diferentes nos dois casos. Tratar
 * os dois como zero é exatamente como um painel mente durante uma queda.
 */
export async function stats() {
  if (dbEnabled()) {
    const evs = await readEventsDb();
    if (evs === null) return { ...agrega([]), erro: true, fonte: "banco" as const };
    return { ...agrega(evs), erro: false, fonte: "banco" as const };
  }
  return { ...agrega(readEvents()), erro: false, fonte: "arquivo" as const };
}
