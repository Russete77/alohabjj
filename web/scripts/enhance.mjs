// enhance.mjs — tratamento determinístico (sem IA) de uma imagem REAL da web/biblioteca
// pra virar FUNDO da arte. Faz o que a gente pediria pra IA "deixar interessante", só que
// grátis e sem alucinar: crop inteligente no assunto, grade editorial (contraste/cor/nitidez)
// e vinheta suave pra dar foco. O frame AlohaBJJ entra por cima depois (render_story --bg).
// Uso: node scripts/enhance.mjs --in <img> --out <png> [--w 1080] [--h 1350]
import sharp from "sharp";

const A = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const IN = A.in, OUT = A.out;
const W = parseInt(A.w || "1080", 10), H = parseInt(A.h || "1350", 10);
if (!IN || !OUT) { console.error("faltou --in/--out"); process.exit(1); }

// vinheta editorial (escurece cantos, foca no centro)
const vignette = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>
     <radialGradient id="v" cx="50%" cy="42%" r="75%">
       <stop offset="55%" stop-color="#000" stop-opacity="0"/>
       <stop offset="100%" stop-color="#000" stop-opacity="0.34"/>
     </radialGradient></defs>
   <rect width="${W}" height="${H}" fill="url(#v)"/></svg>`,
);

try {
  const base = await sharp(IN)
    .rotate()                                             // respeita EXIF
    .resize(W, H, { fit: "cover", position: "attention" }) // crop inteligente no assunto
    .modulate({ brightness: 1.035, saturation: 1.14 })    // cor viva, natural
    .linear(1.09, -9)                                     // contraste editorial
    .gamma(1.03)
    .sharpen({ sigma: 0.9 })                              // nitidez percebida
    .toBuffer();

  await sharp(base)
    .composite([{ input: vignette, blend: "over" }])
    .png({ quality: 92 })
    .toFile(OUT);

  console.log(`OK imagem tratada ${W}x${H} -> ${OUT}`);
} catch (e) {
  console.error("enhance falhou:", e.message);
  process.exit(2);
}
