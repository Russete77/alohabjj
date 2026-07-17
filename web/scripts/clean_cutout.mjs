// clean_cutout.mjs — tira a orla colorida (fringe) do recorte do lucas.png.
// O halo vermelho nas orelhas são pixels de alpha parcial (borda do recorte) que
// aparecem sobre o teal. Solução determinística (sem IA): ERODE o alpha ~1-2px
// (blur + threshold) pra comer a orla, depois um leve feather pra não ficar serrilhado,
// e desatura a faixa de borda restante pra matar qualquer resíduo de cor.
// Uso: node scripts/clean_cutout.mjs [in] [out]   (default: lucas.png -> lucas.png, backup lucas_orig.png)
import sharp from "sharp";
import { existsSync, copyFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve("public/templates");
const IN = process.argv[2] || path.join(DIR, "lucas.png");
const OUT = process.argv[3] || path.join(DIR, "lucas.png");
const CMP = path.join(DIR, "_ears_cmp.png");

const src = sharp(IN);
const meta = await src.metadata();
const { width: W, height: H } = meta;

// alpha original
const alpha0 = await sharp(IN).extractChannel(3).toColourspace("b-w").raw().toBuffer();

// EROSÃO: blur espalha a borda, threshold corta ~1-2px pra dentro (some a orla),
// feather suave pra borda limpa.
const alphaEroded = await sharp(IN)
  .extractChannel(3)
  .blur(1.3)
  .threshold(168)      // < ~66% depois do blur => fora (erode a orla)
  .blur(0.6)           // feather anti-serrilhado
  .toColourspace("b-w")
  .raw()
  .toBuffer();

// faixa de borda = onde tinha alpha e agora está na transição (0<a<250): desatura o RGB ali
// (mata resíduo de cor vermelha na pele/orelha da borda)
const rgb = await sharp(IN).removeAlpha().raw().toBuffer(); // W*H*3
const desat = Buffer.from(rgb);
for (let i = 0, p = 0; i < alphaEroded.length; i++, p += 3) {
  const a = alphaEroded[i];
  if (a > 8 && a < 245) {
    // média (cinza) puxada levemente — reduz saturação da borda
    const g = (desat[p] * 0.299 + desat[p + 1] * 0.587 + desat[p + 2] * 0.114) | 0;
    const k = 0.55; // 0=original, 1=cinza total
    desat[p] = (desat[p] * (1 - k) + g * k) | 0;
    desat[p + 1] = (desat[p + 1] * (1 - k) + g * k) | 0;
    desat[p + 2] = (desat[p + 2] * (1 - k) + g * k) | 0;
  }
}

const cleaned = await sharp(desat, { raw: { width: W, height: H, channels: 3 } })
  .joinChannel(alphaEroded, { raw: { width: W, height: H, channels: 1 } })
  .png()
  .toBuffer();

// backup do original 1x
const backup = path.join(DIR, "lucas_orig.png");
if (OUT === IN && !existsSync(backup)) copyFileSync(IN, backup);

// comparação antes/depois sobre teal (zoom nas orelhas)
const TEAL = { r: 26, g: 156, b: 180 };
const before = await sharp({ create: { width: W, height: H, channels: 3, background: TEAL } })
  .composite([{ input: IN }]).png().toBuffer();
const after = await sharp({ create: { width: W, height: H, channels: 3, background: TEAL } })
  .composite([{ input: cleaned }]).png().toBuffer();
await sharp({ create: { width: W * 2 + 30, height: H, channels: 3, background: { r: 20, g: 20, b: 22 } } })
  .composite([{ input: before, left: 0, top: 0 }, { input: after, left: W + 30, top: 0 }])
  .png().toFile(CMP);

await sharp(cleaned).toFile(OUT);
console.log(`OK cutout limpo -> ${path.basename(OUT)} (backup lucas_orig.png) · comparação -> ${path.basename(CMP)}`);
