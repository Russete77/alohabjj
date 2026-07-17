// render_slides.mjs — renderiza os slides do carrossel como PNGs 1080x1350 (feed IG 4:5).
// Marca AlohaBJJ (teal + vermelho + branco), footer do site, contador e progresso.
// Uso: node web/scripts/render_slides.mjs --slug <slug>   (lê outputs/<slug>/slides.json)
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

const W = 1080, H = 1350;
const TEAL = "#1A9CB4", TEAL_D = "#16879C", RED = "#D8232A", WHITE = "#FFFFFF", INK = "#0C333B";
const D = "Impact, 'Arial Narrow', sans-serif", S = "Arial, sans-serif";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = (t || "").split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }

function progress(n, total) {
  const gap = 8, wtot = W - 160, wseg = (wtot - gap * (total - 1)) / total;
  let x = 80; const segs = [];
  for (let i = 0; i < total; i++) {
    segs.push(`<rect x="${x}" y="${H - 70}" width="${wseg}" height="6" rx="3" fill="${i <= n ? RED : 'rgba(255,255,255,.35)'}"/>`);
    x += wseg + gap;
  }
  return segs.join("");
}

function footer() {
  return `<text x="80" y="${H - 96}" font-family="${D}" font-size="30" fill="${WHITE}" letter-spacing="0.5">ALOHA<tspan fill="${RED}">BJJ</tspan>NEWS.COM</text>
  <text x="${W - 80}" y="${H - 96}" font-family="${S}" font-weight="700" font-size="22" fill="rgba(255,255,255,.75)" text-anchor="end" letter-spacing="1">@BJJCOMLUCAS</text>`;
}

function titleFont(n) { return n <= 2 ? 84 : n === 3 ? 76 : n === 4 ? 66 : 56; }

function slideSVG(sl, idx, total) {
  const isCTA = !!sl.cta;
  const head = `<rect width="${W}" height="${H}" fill="${isCTA ? TEAL_D : TEAL}"/>
    <text x="80" y="96" font-family="${D}" font-size="34" fill="${WHITE}" letter-spacing="1">ALOHA<tspan fill="${RED}">BJJ</tspan></text>
    <text x="${W - 80}" y="94" font-family="${S}" font-weight="700" font-size="26" fill="rgba(255,255,255,.8)" text-anchor="end">${idx + 1}/${total}</text>`;

  const kick = wrap((sl.kicker || "").toUpperCase(), 40)[0] || "";
  const tl = wrap((sl.titulo || "").toUpperCase(), 17);
  const tf = titleFont(tl.length), tlh = tf * 1.06;
  const barY = 290, kickerY = 350, titleY = 456;
  const tlS = tl.map((l, i) => `<text x="80" y="${titleY + i * tlh}" font-family="${D}" font-size="${tf}" fill="${WHITE}">${esc(l)}</text>`).join("");
  const bodyY = titleY + (tl.length - 1) * tlh + 78;
  const bd = wrap(sl.corpo || "", 40);
  const bf = isCTA ? 34 : 36;
  const bdS = bd.map((l, i) => `<text x="80" y="${bodyY + i * (bf + 14)}" font-family="${S}" font-weight="500" font-size="${bf}" fill="rgba(255,255,255,.94)">${esc(l)}</text>`).join("");

  let cta = "";
  if (isCTA) {
    const by = bodyY + bd.length * (bf + 14) + 46;
    cta = `<rect x="80" y="${by}" width="680" height="98" rx="8" fill="${RED}"/>
      <text x="420" y="${by + 63}" font-family="${D}" font-size="42" fill="${WHITE}" text-anchor="middle" letter-spacing="0.5">LINK NA BIO · 100% GRÁTIS</text>`;
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${head}
    <rect x="80" y="${barY}" width="90" height="9" fill="${RED}"/>
    <text x="80" y="${kickerY}" font-family="${S}" font-weight="700" font-size="30" fill="${RED}" letter-spacing="3">${esc(kick || (isCTA ? 'AGORA É COM VOCÊ' : ''))}</text>
    ${tlS}${bdS}${cta}${footer()}${progress(idx, total)}</svg>`;
}

const total = slides.length;
let done = 0;
for (let i = 0; i < total; i++) {
  const svg = slideSVG(slides[i], i, total);
  const out = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
  done++;
}
console.log(`OK ${done} slides 1080x1350 → outputs/${slug}/slide-*.png`);
