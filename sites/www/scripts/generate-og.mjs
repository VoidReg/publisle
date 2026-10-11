// Generates public/og.png (1200×630) from the brand lockup. Run once via
// `pnpm --filter @publisle/www generate:og` or `node scripts/generate-og.mjs`;
// the output is committed so builds stay deterministic.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = "#fffdfa";
const INK = "#1a1513";
const MUTED = "#574f4b";
const VERMILION = "#9b3214";

const n = (value) => String(value);
const lockup = await readFile(
  new URL("../public/brand/lockup-light.svg", import.meta.url),
  "utf8",
);
const lockupDataUrl = `data:image/svg+xml;base64,${Buffer.from(lockup).toString("base64")}`;

const card = `<svg width="${n(WIDTH)}" height="${n(HEIGHT)}" viewBox="0 0 ${n(WIDTH)} ${n(HEIGHT)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${n(WIDTH)}" height="${n(HEIGHT)}" fill="${PAPER}"/>
  <rect x="0" y="0" width="${n(WIDTH)}" height="10" fill="${VERMILION}"/>
  <image href="${lockupDataUrl}" x="${n(WIDTH / 2 - 210)}" y="150" width="420" height="168"/>
  <text x="${n(WIDTH / 2)}" y="420" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="${INK}">Portable semantic articles, compiled to static HTML</text>
  <text x="${n(WIDTH / 2)}" y="472" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="24" fill="${MUTED}">Markdown or JSON in · validated documents · typed interactive islands</text>
  <text x="${n(WIDTH / 2)}" y="560" text-anchor="middle" font-family="Menlo, monospace" font-size="22" fill="${VERMILION}">publisle.xyz</text>
</svg>`;

const png = await sharp(Buffer.from(card)).png().toBuffer();
const out = new URL("../public/og.png", import.meta.url);
await writeFile(out, png);
console.log(`Wrote ${out.pathname} (${n(png.length)} bytes)`);
