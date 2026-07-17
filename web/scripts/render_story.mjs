// render_story.mjs — arte de capa AlohaBJJ (1080x1350). Headline + elementos do frame.
//   sem --bg: usa o story-frame.jpeg (teal + Lucas + detalhes) e sobrepõe a headline.
//   com --bg <img>: usa a IMAGEM (assunto do conteúdo, recontextualizada) como FUNDO
//                   e recompõe os elementos da marca (Lucas, linha, rodapé, botão, faixa) por cima.
// Uso: node web/scripts/render_story.mjs --headline "T" --out <png> [--bg <img>] [--frame <jpeg>]
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const frame = A.frame || path.resolve("public/templates/story-frame.jpeg");
const LUCAS = path.resolve("public/templates/lucas.png");
const out = A.out, headline = (A.headline || "").trim();
if (!out || !headline) { console.error("faltam --headline e/ou --out"); process.exit(2); }

const W = 1080, H = 1350, RED = "#D8232A", WHITE = "#fff";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = t.split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }

function headlineSVG() {
  const lines = wrap(headline.toUpperCase(), 13);
  const fs = lines.length <= 3 ? 88 : lines.length === 4 ? 72 : 60, lh = fs * 1.04;
  const tspans = lines.map((ln, i) => {
    if (i === lines.length - 1) {
      const p = ln.split(" "), last = p.pop(), head = p.length ? esc(p.join(" ")) + " " : "";
      return `<text x="64" y="${210 + i * lh}" class="h">${head}<tspan class="r">${esc(last)}</tspan></text>`;
    }
    return `<text x="64" y="${210 + i * lh}" class="h">${esc(ln)}</text>`;
  }).join("");
  return `<style>.h{font-family:'Arial Black','Arial',sans-serif;font-weight:900;fill:${WHITE};font-size:${fs}px;letter-spacing:-1px}.r{fill:#ffe0e0}</style>${tspans}`;
}

// elementos da marca redesenhados (usados só no caminho --bg)
function furnitureSVG() {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.28" stop-color="#04222a" stop-opacity="0.15"/>
    <stop offset="1" stop-color="#04222a" stop-opacity="0.88"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="404" y="742" width="9" height="250" fill="${RED}"/>
    <circle cx="452" cy="1150" r="18" fill="none" stroke="${WHITE}" stroke-width="3"/>
    <text x="484" y="1160" font-family="Arial" font-weight="800" font-size="30" fill="${WHITE}" letter-spacing="1">ACESSE:</text>
    <text x="484" y="1214" font-family="'Arial Black',Arial" font-weight="900" font-size="50" fill="${WHITE}">ALOHA<tspan fill="${RED}">BJJ</tspan>NEWS.COM</text>
    <rect x="24" y="1244" width="360" height="52" rx="5" fill="${RED}"/>
    <text x="204" y="1280" font-family="Arial" font-weight="800" font-size="28" fill="${WHITE}" text-anchor="middle" letter-spacing="0.5">SIGA PARA MAIS BJJ</text>
    <rect x="0" y="1312" width="${W}" height="38" fill="#16879C"/>
    ${[0,1,2,3,4].map(i=>`<text x="${40+i*230}" y="1338" font-family="Arial" font-weight="800" font-size="20" fill="rgba(255,255,255,.5)" letter-spacing="1">@BJJCOMLUCAS</text>`).join("")}`;
}

(async () => {
  if (A.bg && existsSync(A.bg)) {
    // FUNDO = imagem do assunto (recontextualizada) + marca por cima
    let img = sharp(await sharp(A.bg).resize(W, H, { fit: "cover", position: "top" }).toBuffer())
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${furnitureSVG()}</svg>`), top: 0, left: 0 }]);
    if (existsSync(LUCAS)) {
      const luc = await sharp(LUCAS).resize({ height: 470 }).toBuffer();
      const m = await sharp(luc).metadata();
      img = sharp(await img.png().toBuffer()).composite([{ input: luc, top: H - m.height - 44, left: -6 }]);
    }
    await sharp(await img.png().toBuffer())
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headlineSVG()}</svg>`), top: 0, left: 0 }])
      .png().toFile(out);
    console.log("OK story (fundo+frame) " + out);
  } else {
    if (!existsSync(frame)) { console.error("frame nao encontrado: " + frame); process.exit(3); }
    await sharp(frame).resize(W, H)
      .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headlineSVG()}</svg>`), top: 0, left: 0 }])
      .png().toFile(out);
    console.log("OK story (frame teal) " + out);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
