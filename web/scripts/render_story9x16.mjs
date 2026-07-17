// render_story9x16.mjs — Story/Reels 1080x1920 (9:16).
//   com --bg <img>: foto REAL tratada como FUNDO + mobília da marca (linha, ACESSE, botão,
//                   faixa, Lucas) no rodapé + headline no topo. Mesmo padrão do 4:5.
//   sem --bg: estende o story-frame.jpeg (teal) e sobrepõe a headline.
// Uso: node scripts/render_story9x16.mjs --headline "T" --out <png> [--bg <img>] [--kicker ..] [--frame <jpeg>]
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const out = A.out, headline = (A.headline || "").trim();
const kicker = (A.kicker || "").trim();
const frame = A.frame || path.resolve("public/templates/story-frame.jpeg");
const LUCAS = path.resolve("public/templates/lucas.png");
if (!out || !headline) { console.error("faltam --headline e/ou --out"); process.exit(2); }

const W = 1080, H = 1920, RED = "#D8232A", WHITE = "#fff", D = "Impact,'Arial Narrow',sans-serif";
const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(t, max) { const w = t.split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }

function headlineSVG(y0) {
  const lines = wrap(headline.toUpperCase(), 12);
  const fs = lines.length <= 3 ? 116 : 94, lh = fs * 1.14;
  const kick = kicker
    ? `<rect x="72" y="${y0 - 150}" width="110" height="10" fill="${RED}"/><text x="72" y="${y0 - 90}" font-family="Arial" font-weight="700" font-size="34" fill="${RED}" letter-spacing="4">${esc(kicker.toUpperCase())}</text>`
    : "";
  const hl = lines.map((l, i) => {
    const last = i === lines.length - 1;
    return `<text x="70" y="${y0 + i * lh}" font-family="${D}" font-size="${fs}" fill="${last ? "#ffe0e0" : "#fff"}" letter-spacing="1">${esc(l)}</text>`;
  }).join("");
  return kick + hl;
}

// mobília da marca no rodapé, posicionada pra 9:16
function furnitureSVG() {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.35" stop-color="#04222a" stop-opacity="0.12"/>
    <stop offset="1" stop-color="#04222a" stop-opacity="0.9"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="404" y="1300" width="9" height="230" fill="${RED}"/>
    <circle cx="452" cy="1690" r="18" fill="none" stroke="${WHITE}" stroke-width="3"/>
    <text x="484" y="1700" font-family="Arial" font-weight="800" font-size="30" fill="${WHITE}" letter-spacing="1">ACESSE:</text>
    <text x="484" y="1754" font-family="'Arial Black',Arial" font-weight="900" font-size="50" fill="${WHITE}">ALOHA<tspan fill="${RED}">BJJ</tspan>NEWS.COM</text>
    <rect x="24" y="1790" width="360" height="52" rx="5" fill="${RED}"/>
    <text x="204" y="1826" font-family="Arial" font-weight="800" font-size="28" fill="${WHITE}" text-anchor="middle" letter-spacing="0.5">SIGA PARA MAIS BJJ</text>
    <rect x="0" y="1876" width="${W}" height="44" fill="#16879C"/>
    ${[0,1,2,3,4].map(i=>`<text x="${40+i*230}" y="1906" font-family="Arial" font-weight="800" font-size="20" fill="rgba(255,255,255,.5)" letter-spacing="1">@BJJCOMLUCAS</text>`).join("")}`;
}

if (A.bg && existsSync(A.bg)) {
  // FUNDO = foto real tratada + marca por cima
  let img = sharp(await sharp(A.bg).resize(W, H, { fit: "cover", position: "attention" }).toBuffer())
    .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${furnitureSVG()}</svg>`), top: 0, left: 0 }]);
  if (existsSync(LUCAS)) {
    const luc = await sharp(LUCAS).resize({ height: 520 }).toBuffer();
    const m = await sharp(luc).metadata();
    img = sharp(await img.png().toBuffer()).composite([{ input: luc, top: H - m.height - 56, left: -6 }]);
  }
  await sharp(await img.png().toBuffer())
    .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headlineSVG(470)}</svg>`), top: 0, left: 0 }])
    .png().toFile(out);
  console.log("OK story 9:16 (fundo+marca) " + out);
} else {
  if (!existsSync(frame)) { console.error("frame nao encontrado: " + frame); process.exit(3); }
  const fr = await sharp(frame).resize(W).toBuffer();
  const fm = await sharp(fr).metadata();
  const { data } = await sharp(frame).extract({ left: 6, top: 6, width: 2, height: 2 }).raw().toBuffer({ resolveWithObject: true });
  const teal = { r: data[0], g: data[1], b: data[2] };
  const cropTop = 340, cropH = fm.height - cropTop;
  const frCrop = await sharp(fr).extract({ left: 0, top: cropTop, width: W, height: cropH }).toBuffer();
  const top = H - cropH;
  await sharp({ create: { width: W, height: H, channels: 4, background: teal } })
    .composite([{ input: frCrop, top, left: 0 }, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${headlineSVG(430)}</svg>`), top: 0, left: 0 }])
    .png().toFile(out);
  console.log("OK story 9:16 (frame teal) " + out);
}
