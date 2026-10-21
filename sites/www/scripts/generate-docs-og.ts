import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { docSources } from "../src/lib/docs-source.ts";

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
for (const doc of docSources()) {
  const words = doc.title.split(" ");
  const lines: string[] = [""];
  for (const word of words) {
    if ((lines.at(-1) ?? "").length + word.length > 35) lines.push("");
    lines[lines.length - 1] += `${word} `;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fffdfa"/><rect width="1200" height="12" fill="#9b3214"/><text x="80" y="110" font-family="sans-serif" font-size="30" fill="#9b3214">PUBLISLE / ${doc.section.toUpperCase()}</text>${lines.map((line, i) => `<text x="80" y="${String(230 + i * 65)}" font-family="sans-serif" font-size="48" fill="#1a1513">${escape(line)}</text>`).join("")}<text x="80" y="560" font-family="sans-serif" font-size="28" fill="#574f4b">publisle.xyz/docs/${escape(doc.id)}</text></svg>`;
  const out = new URL(`../public/og/docs/${doc.id}.png`, import.meta.url);
  await mkdir(dirname(out.pathname), { recursive: true });
  await writeFile(out, await sharp(Buffer.from(svg)).png().toBuffer());
}
