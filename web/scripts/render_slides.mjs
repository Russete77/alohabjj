// render_slides.mjs — slides do carrossel 1080x1350 (feed IG), REDESENHADOS (não usa o JPEG chapado).
// Layout (pedido do Lucas): topo = imagem do assunto (--bg) ou teal; texto DESCE pro lado do
// traço vermelho; URL do site DESCE e alinha no mesmo eixo Y do botão SIGA (canto esq.).
// Uso: node web/scripts/render_slides.mjs --slug <slug> [--bg <img>]
import sharp from "sharp";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const slug = A.slug;
if (!slug) { console.error("faltou --slug"); process.exit(2); }
const ROOT = path.resolve("..");
const outDir = path.join(ROOT, "outputs", slug);
const slides = JSON.parse(readFileSync(path.join(outDir, "slides.json"), "utf-8"));
let meta = {}; try { meta = JSON.parse(readFileSync(path.join(outDir, "meta.json"), "utf-8")); } catch {}
const LUCAS = path.resolve("public/templates/lucas.png");

const W = 1080, H = 1350, TEAL = "#1A9CB4", TEAL_D = "#16879C", RED = "#D8232A", WHITE = "#fff", INK = "#0C333B";
const D = "Impact,'Arial Narrow',sans-serif", S = "Arial,sans-serif";
const LINE_X = 404;                 // traço vermelho vertical
const TX = 448;                     // texto começa à direita do traço
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = (t || "").split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }
function titleFont(n) { return n <= 2 ? 60 : n === 3 ? 54 : n === 4 ? 48 : 42; }

async function baseFor() {
  if (A.bg && existsSync(A.bg)) {
    const bg = await sharp(A.bg).resize(W, H, { fit: "cover", position: "top" }).toBuffer();
    // degradê escuro no rodapé pra legibilidade do texto sobre a foto
    const grad = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.34" stop-color="#04222a" stop-opacity="0"/>
      <stop offset="0.62" stop-color="#04222a" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#04222a" stop-opacity="0.94"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
    return sharp(bg).composite([{ input: Buffer.from(grad), top: 0, left: 0 }]).png().toBuffer();
  }
  return sharp({ create: { width: W, height: H, channels: 4, background: TEAL } }).png().toBuffer();
}

function overlaySVG(sl, idx, total) {
  const isCTA = !!sl.cta;
  const kick = wrap((sl.kicker || (isCTA ? "AGORA É COM VOCÊ" : "")).toUpperCase(), 34)[0] || "";
  const tl = wrap((sl.titulo || "").toUpperCase(), 15);
  const tf = titleFont(tl.length), tlh = tf * 1.05;

  // bloco de texto na METADE DE BAIXO, ao lado do traço. Ancorado por baixo (acima do URL).
  const bodyLines = wrap(sl.corpo || "", 34).slice(0, 4);
  const bodyH = bodyLines.length * 42;
  const titleH = tl.length * tlh;
  const blockBottom = 1168;                         // fim do bloco (texto DESCE — mais foto no topo)
  const bodyTop = blockBottom - bodyH;
  const titleBottom = bodyTop - 26;
  const titleTop = titleBottom - titleH;
  const kickerY = titleTop - 26;

  const tlS = tl.map((l, i) => `<text x="${TX}" y="${titleTop + (i + 1) * tlh}" font-family="${D}" font-size="${tf}" fill="${WHITE}">${esc(l)}</text>`).join("");
  const bdS = bodyLines.map((l, i) => `<text x="${TX}" y="${bodyTop + (i + 1) * 42 - 8}" font-family="${S}" font-weight="500" font-size="30" fill="rgba(255,255,255,.95)">${esc(l)}</text>`).join("");

  // traço vermelho: cobre o bloco de texto (do kicker ao fim do corpo)
  const lineTop = kickerY - 34, lineH = blockBottom - lineTop + 6;

  let prod = "";
  if (isCTA && meta.produto_titulo) {
    prod = `<text x="${TX}" y="${blockBottom + 34}" font-family="${S}" font-weight="700" font-size="24" fill="#ffe0e0">👉 ${esc(meta.produto_titulo)}</text>`;
  }

  // rodapé: URL do site DESCE um pouco mais (pedido do Lucas), perto da faixa
  const footY = 1290;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W - 56}" y="132" font-family="${S}" font-weight="800" font-size="26" fill="rgba(255,255,255,.9)" text-anchor="end">${idx + 1}/${total}</text>
    <rect x="${LINE_X}" y="${lineTop}" width="9" height="${lineH}" fill="${RED}"/>
    <text x="${TX}" y="${kickerY}" font-family="${S}" font-weight="700" font-size="26" fill="#ffcfcf" letter-spacing="2.5">${esc(kick)}</text>
    ${tlS}${bdS}${prod}
    <rect x="24" y="1250" width="330" height="52" rx="5" fill="${RED}"/>
    <text x="189" y="1284" font-family="${S}" font-weight="800" font-size="26" fill="${WHITE}" text-anchor="middle" letter-spacing="0.5">SIGA PARA MAIS BJJ</text>
    <circle cx="${TX + 14}" cy="${footY - 9}" r="15" fill="none" stroke="${WHITE}" stroke-width="3"/>
    <text x="${TX + 40}" y="${footY}" font-family="'Arial Black',Arial" font-weight="900" font-size="40" fill="${WHITE}">ALOHA<tspan fill="${RED}">BJJ</tspan>NEWS.COM</text>
    <rect x="0" y="1312" width="${W}" height="38" fill="${TEAL_D}"/>
    ${[0,1,2,3,4].map(i=>`<text x="${40+i*230}" y="1338" font-family="${S}" font-weight="800" font-size="20" fill="rgba(255,255,255,.5)" letter-spacing="1">@BJJCOMLUCAS</text>`).join("")}
  </svg>`;
}

const total = slides.length;
const base = await baseFor();
let lucas = null, lucasMeta = null;
if (existsSync(LUCAS)) { lucas = await sharp(LUCAS).resize({ height: 440 }).toBuffer(); lucasMeta = await sharp(lucas).metadata(); }

let done = 0;
for (let i = 0; i < total; i++) {
  let img = sharp(base);
  const comp = [];
  if (lucas) comp.push({ input: lucas, top: 1306 - lucasMeta.height, left: -6 });   // Lucas primeiro
  comp.push({ input: Buffer.from(overlaySVG(slides[i], i, total)), top: 0, left: 0 }); // SVG por cima (botão/URL visíveis)
  await img.composite(comp).png().toFile(path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`));
  done++;
}
console.log(`OK ${done} slides 1080x1350 (${A.bg ? "fundo+layout" : "teal+layout"}) → outputs/${slug}/slide-*.png`);
