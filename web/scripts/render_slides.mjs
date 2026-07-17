// render_slides.mjs — slides do carrossel 1080x1350 (feed IG) COM os detalhes do story-frame.
// Base = story-frame.jpeg (Lucas + linha vermelha + rodapé + botão SIGA + faixa @bjjcomlucas).
// Opcional --bg <img>: usa uma imagem de fundo e recompõe os elementos da marca por cima.
// Conteúdo (kicker/titulo/corpo) entra na zona livre do topo; último slide = CTA de conversão.
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
const FRAME = path.resolve("public/templates/story-frame.jpeg");
const LUCAS = path.resolve("public/templates/lucas.png");

const W = 1080, H = 1350, RED = "#D8232A", WHITE = "#fff", INK = "#0C333B";
const D = "Impact,'Arial Narrow',sans-serif", S = "Arial,sans-serif";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = (t || "").split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }
function titleFont(n) { return n <= 2 ? 78 : n === 3 ? 68 : n === 4 ? 58 : 50; }

// elementos da marca (redesenhados) — só usados no caminho com imagem de fundo
async function furniture(base) {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.35" stop-color="#04222a" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#04222a" stop-opacity="0.9"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="404" y="742" width="9" height="250" fill="${RED}"/>
    <text x="470" y="1160" font-family="${S}" font-weight="800" font-size="30" fill="${WHITE}" letter-spacing="1">ACESSE:</text>
    <text x="470" y="1215" font-family="${D}" font-size="52" fill="${WHITE}">ALOHA<tspan fill="${RED}">BJJ</tspan>NEWS.COM</text>
    <rect x="24" y="1244" width="360" height="52" rx="5" fill="${RED}"/>
    <text x="204" y="1280" font-family="${S}" font-weight="800" font-size="28" fill="${WHITE}" text-anchor="middle" letter-spacing="0.5">SIGA PARA MAIS BJJ</text>
    <rect x="0" y="1312" width="${W}" height="38" fill="#16879C"/>
    ${[0,1,2,3,4].map(i=>`<text x="${40+i*230}" y="1338" font-family="${S}" font-weight="800" font-size="20" fill="rgba(255,255,255,.5)" letter-spacing="1">@BJJCOMLUCAS</text>`).join("")}
  </svg>`;
  let img = sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  if (existsSync(LUCAS)) {
    const luc = await sharp(LUCAS).resize({ height: 470 }).toBuffer();
    const m = await sharp(luc).metadata();
    img = sharp(await img.png().toBuffer()).composite([{ input: luc, top: H - m.height - 44, left: -6 }]);
  }
  return img.png().toBuffer();
}

async function baseFor() {
  if (A.bg && existsSync(A.bg)) {
    const bg = await sharp(A.bg).resize(W, H, { fit: "cover", position: "top" }).toBuffer();
    return furniture(bg);
  }
  return sharp(FRAME).resize(W, H).png().toBuffer();  // frame já traz Lucas + detalhes
}

function contentSVG(sl, idx, total) {
  const isCTA = !!sl.cta;
  const kick = wrap((sl.kicker || (isCTA ? "AGORA É COM VOCÊ" : "")).toUpperCase(), 34)[0] || "";
  const tl = wrap((sl.titulo || "").toUpperCase(), 16);
  const tf = titleFont(tl.length), tlh = tf * 1.05;
  const kickerY = 175, titleY = 260;
  const tlS = tl.map((l, i) => `<text x="64" y="${titleY + i * tlh}" font-family="${D}" font-size="${tf}" fill="${WHITE}">${esc(l)}</text>`).join("");
  const bodyY = titleY + (tl.length - 1) * tlh + 66;
  const bd = wrap(sl.corpo || "", 42).slice(0, 4);
  const bdS = bd.map((l, i) => `<text x="64" y="${bodyY + i * 44}" font-family="${S}" font-weight="500" font-size="31" fill="rgba(255,255,255,.95)">${esc(l)}</text>`).join("");
  // produto associado no slide de CTA
  let prod = "";
  if (isCTA && meta.produto_titulo) {
    prod = `<text x="64" y="${bodyY + bd.length * 44 + 40}" font-family="${S}" font-weight="700" font-size="26" fill="#ffe0e0">👉 ${esc(meta.produto_titulo)}${meta.link_afiliado ? " · link na bio" : ""}</text>`;
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W-64}" y="140" font-family="${S}" font-weight="800" font-size="26" fill="rgba(255,255,255,.85)" text-anchor="end">${idx + 1}/${total}</text>
    <rect x="64" y="${kickerY-34}" width="70" height="8" fill="${RED}"/>
    <text x="64" y="${kickerY}" font-family="${S}" font-weight="700" font-size="28" fill="${RED}" letter-spacing="2.5">${esc(kick)}</text>
    ${tlS}${bdS}${prod}</svg>`;
}

const total = slides.length;
const base = await baseFor();
let done = 0;
for (let i = 0; i < total; i++) {
  const out = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  await sharp(base).composite([{ input: Buffer.from(contentSVG(slides[i], i, total)), top: 0, left: 0 }]).png().toFile(out);
  done++;
}
console.log(`OK ${done} slides 1080x1350 (${A.bg ? "fundo+frame" : "story-frame"}) → outputs/${slug}/slide-*.png`);
