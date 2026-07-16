// render_card.mjs — card de notícia estilo AlohaBJJ (foto-first, tipo BACCI).
// foto de fundo (real ou IA) + degradê + headline + marca + crédito + apresentador no canto.
// Uso: node web/scripts/render_card.mjs --hero <path|url> --headline "T" --out <png>
//      [--credito "ibjjf.com"] [--lucas <png>] [--pill "ACESSE NOS STORIES"]
import sharp from "sharp";
import { existsSync } from "node:fs";

const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const W = 1080, H = 1350;
const out = A.out, headline = (A.headline || "").trim();
const pill = A.pill || "ACESSE NOS STORIES";
if (!out || !headline) { console.error("faltam --headline e/ou --out"); process.exit(2); }

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrap(t, max) { const w = t.split(/\s+/), l = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length > max && c) { l.push(c.trim()); c = x; } else c = (c + " " + x).trim(); }
  if (c) l.push(c.trim()); return l; }

async function loadHero(src) {
  if (/^https?:\/\//.test(src)) { const r = await fetch(src); return Buffer.from(await r.arrayBuffer()); }
  if (existsSync(src)) return src;
  throw new Error("hero não encontrado: " + src);
}

(async () => {
  const hero = await sharp(await loadHero(A.hero)).resize(W, H, { fit: "cover", position: "top" }).toBuffer();

  // largura curta: headline fica à ESQUERDA do apresentador (canto inf. direito)
  const lines = wrap(headline.toUpperCase(), A.lucas ? 14 : 20);
  const fs = lines.length <= 2 ? 64 : lines.length === 3 ? 56 : 48;
  const lh = fs * 1.12;
  const lastY = 1205, startY = lastY - (lines.length - 1) * lh;
  const tspans = lines.map((ln, i) => `<text x="80" y="${startY + i * lh}" class="h">${esc(ln)}</text>`).join("");
  const credito = A.credito ? `<text x="80" y="1330" class="cred">Foto: ${esc(A.credito)}</text>` : "";

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.38" stop-color="#04222a" stop-opacity="0"/>
      <stop offset="0.70" stop-color="#04222a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#04222a" stop-opacity="0.97"/></linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="40" y="40" width="${28 + pill.length * 15.5}" height="58" rx="8" fill="#D8232A"/>
    <circle cx="70" cy="69" r="8" fill="#fff"/>
    <text x="90" y="79" class="pill">${esc(pill)}</text>
    <circle cx="1000" cy="82" r="52" fill="#fff"/>
    <text x="1000" y="76" class="logo" text-anchor="middle">ALOHA</text>
    <text x="1000" y="100" class="logor" text-anchor="middle">BJJ</text>
    <rect x="54" y="${startY - lh + 26}" width="7" height="${lines.length * lh}" fill="#D8232A"/>
    ${tspans}
    <text x="80" y="1288" class="site">ALOHA<tspan fill="#ff5a5a">BJJ</tspan>NEWS.COM</text>
    ${credito}
    <style>
      .h{font-family:'Arial Black','Arial',sans-serif;font-weight:900;fill:#fff;font-size:${fs}px;letter-spacing:-0.5px}
      .pill{font-family:'Arial',sans-serif;font-weight:800;fill:#fff;font-size:25px}
      .logo{font-family:'Arial Black',sans-serif;font-weight:900;fill:#0C333B;font-size:21px}
      .logor{font-family:'Arial Black',sans-serif;font-weight:900;fill:#D8232A;font-size:22px}
      .site{font-family:'Arial Black',sans-serif;font-weight:900;fill:#fff;font-size:34px;letter-spacing:-0.5px}
      .cred{font-family:'Arial',sans-serif;font-weight:700;fill:rgba(255,255,255,.6);font-size:20px}
    </style></svg>`;

  let img = sharp(hero).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  // apresentador (Lucas) no canto inferior direito, se houver recorte
  if (A.lucas && existsSync(A.lucas)) {
    const luc = await sharp(A.lucas).resize({ height: 300 }).toBuffer();
    const m = await sharp(luc).metadata();
    img = sharp(await img.png().toBuffer()).composite([{ input: luc, top: H - m.height, left: W - m.width - 10 }]);
  }
  await img.png().toFile(out);
  console.log("OK card " + lines.length + " linhas, " + fs + "px");
})().catch((e) => { console.error(e.message); process.exit(1); });
