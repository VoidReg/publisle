/** Exercise the public default and explicit native engines after activation. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const base = "https://api.publisle.xyz";
for (const engine of [undefined, "rust"]) {
  const title = `Release verification ${engine ?? "default"} ${Date.now()}`;
  const markdown = `---\ntitle: ${title}\nlanguage: en\nauthors:\n  - name: Release verification\n---\n\nA public PDF compilation verifies the deployed service.\n`;
  const response = await fetch(`${base}/pdf/compile`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/pdf" },
    body: JSON.stringify({
      markdown,
      template: "article",
      ...(engine ? { engine } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(
    response.status,
    200,
    `Public ${engine ?? "default"} compilation failed: ${await (response.ok ? Promise.resolve("") : response.text())}`,
  );
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const text = execFileSync("pdftotext", ["-", "-"], {
    input: pdf,
    encoding: "utf8",
    timeout: 10000,
  });
  assert(
    text.includes(title),
    `Public ${engine ?? "default"} PDF lost its title`,
  );
  assert(!/[\u25a1\ufffd]/u.test(text), "Public PDF contains missing glyphs");
}
console.log("Public default and native PDF compilations passed.");
