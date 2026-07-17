// render_story9x16.mjs — Story 1080x1920 (9:16) a partir do frame AlohaBJJ 4:5.
// Estende o frame (rodapé preservado: Lucas, site, botão, faixa) + headline no topo.
// Uso: node web/scripts/render_story9x16.mjs --headline "T" --out <png> [--kicker "..."] [--frame <jpeg>]
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const out = A.out, headline = (A.headline || "").trim();
const kicker = (A.kicker || "").trim();
const frame = A.frame || path.resolve("public/templates/story-frame.jpeg");
if (!out || !headline) { console.error("faltam --headline e/ou --out"); process.exit(2); }
if (!existsSync(frame)) { console.error("frame nao encontrado: " + frame); process.exit(3); }

const W = 1080, H = 1920, RED = "#D8232A", D = "Impact,'Arial Narrow',sans-serif";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = t.split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }

const { data } = await sharp(frame).extract({ left: 6, top: 6, width: 2, height: 2 }).raw().toBuffer({ resolveWithObject: true });
const teal = { r: data[0], g: data[1], b: data[2] };
const fr = await sharp(frame).resize(W).toBuffer();
const fm = await sharp(fr).metadata();
const cropTop = 340, cropH = fm.height - cropTop;
const frCrop = await sharp(fr).extract({ left: 0, top: cropTop, width: W, height: cropH }).toBuffer();
const top = H - cropH;

const lines = wrap(headline.toUpperCase(), 11);
const fs = lines.length <= 3 ? 118 : 96, lh = fs * 1.16;
const y0 = 430;
const hl = lines.map((l, i) => {
  const last = i === lines.length - 1;
  return `<text x="70" y="${y0 + i * lh}" font-family="${D}" font-size="${fs}" fill="${last ? '#ffe0e0' : '#fff'}" letter-spacing="1">${esc(l)}</text>`;
}).join("");
const kick = kicker ? `<rect x="72" y="250" width="110" height="10" fill="${RED}"/><text x="72" y="320" font-family="Arial" font-weight="700" font-size="34" fill="${RED}" letter-spacing="4">${esc(kicker.toUpperCase())}</text>` : "";
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${kick}${hl}</svg>`;

await sharp({ create: { width: W, height: H, channels: 4, background: teal } })
  .composite([{ input: frCrop, top, left: 0 }, { input: Buffer.from(svg), top: 0, left: 0 }])
  .png().toFile(out);
console.log("OK story 9:16 " + out + " (" + lines.length + " linhas)");
