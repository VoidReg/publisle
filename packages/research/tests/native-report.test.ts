import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromMarkdown } from "../../markdown/src/index.ts";
import { compileNativePdf } from "../src/native-node.ts";
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function compiler(report: unknown, header = "%PDF-2.0") {
  const directory = await mkdtemp(join(tmpdir(), "publisle-native-report-"));
  temporary.push(directory);
  const executable = join(directory, "compiler.mjs");
  await writeFile(
    executable,
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(process.argv[3], ${JSON.stringify(header)});\nconsole.log(${JSON.stringify(JSON.stringify(report))});\n`,
  );
  await chmod(executable, 0o755);
  const document = fromMarkdown(
    "---\ntitle: Report validation\nauthors:\n  - name: Ada\n---\n\n# Text\n\nContent.",
  ).document;
  if (!document) throw new Error("Invalid fixture");
  return {
    document,
    options: {
      executable,
      sourceDirectory: directory,
      fonts: [{ path: "/pinned/font.ttf", role: "regular" as const }],
    },
  };
}
it.skipIf(process.platform === "win32")(
  "rejects impossible or malformed compiler reports",
  async () => {
    for (const invalid of [
      { pages: 0 },
      { pages: 301 },
      { diagnostics: "warnings" },
      { diagnostics: [{ code: "x", message: 123 }] },
      { timings: { compilerMs: -1 } },
    ]) {
      const { document, options } = await compiler({
        ok: true,
        pages: 1,
        compilerVersion: "0.1.0",
        ...invalid,
      });
      await expect(compileNativePdf(document, options)).rejects.toThrow(
        /Invalid native compiler report/u,
      );
    }
  },
);
it.skipIf(process.platform === "win32")(
  "rejects a PDF version that contradicts the requested standard",
  async () => {
    const { document, options } = await compiler(
      { ok: true, pages: 1, compilerVersion: "0.1.0" },
      "%PDF-2.0",
    );
    await expect(
      compileNativePdf(document, { ...options, pdfUa: "ua-1" }),
    ).rejects.toThrow(/wrong PDF version/u);
  },
);
