// render_story.mjs — compõe a headline sobre o frame AlohaBJJ e gera PNG (Story/Reel).
// Uso: node web/scripts/render_story.mjs --headline "TEXTO" --out <abs.png> [--frame <abs.jpeg>]
// Roda com cwd=web (onde o sharp está instalado). Sem browser headless.
import sharp from "sharp";
import { existsSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]);
    return a;
  }, [])
);

const frame = args.frame || path.resolve("public/templates/story-frame.jpeg");
const out = args.out;
const headline = (args.headline || "").trim();
if (!out || !headline) {
  console.error("faltam --headline e/ou --out");
  process.exit(2);
}
if (!existsSync(frame)) {
  console.error("frame nao encontrado: " + frame);
  process.exit(3);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// quebra a headline em linhas curtas (~13 chars), respeitando palavras
function wrap(text, max = 13) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

(async () => {
  const meta = await sharp(frame).metadata();
  const W = meta.width, H = meta.height;
  const lines = wrap(headline.toUpperCase());
  const fontSize = lines.length <= 3 ? 88 : lines.length === 4 ? 72 : 60;
  const lineH = fontSize * 1.04;
  const x = 64;
  let y = 210; // baseline da 1ª linha (zona teal livre)

  const tspans = lines
    .map((ln, i) => {
      // última palavra da última linha em vermelho-claro (acento da marca)
      if (i === lines.length - 1) {
        const parts = ln.split(" ");
        const last = parts.pop();
        const head = parts.length ? esc(parts.join(" ")) + " " : "";
        return `<text x="${x}" y="${y + i * lineH}" class="h">${head}<tspan class="r">${esc(last)}</tspan></text>`;
      }
      return `<text x="${x}" y="${y + i * lineH}" class="h">${esc(ln)}</text>`;
    })
    .join("");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .h{font-family:'Arial Black','Arial',sans-serif;font-weight:900;fill:#ffffff;
         font-size:${fontSize}px;letter-spacing:-1px}
      .r{fill:#ffe0e0}
    </style>${tspans}</svg>`;

  await sharp(frame)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(out);
  console.log("OK " + out + " (" + lines.length + " linhas, " + fontSize + "px)");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
