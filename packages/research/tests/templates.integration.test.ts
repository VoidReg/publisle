import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it, expect } from "vitest";
import { fromMarkdown } from "../../markdown/src/index.ts";
import { createLatexPackage } from "../src/package.ts";
import {
  compileLatexPackage,
  writeLatexPackage,
  writePackageArchive,
  collectJatsPackage,
} from "../src/node.ts";
import { createJatsPackage } from "../src/jats.ts";
import { resolveDocument } from "../src/resolve.ts";
import { template as acm } from "../../template-acm/src/index.ts";
import {
  template as elsevier,
  authorDateTemplate,
} from "../../template-elsevier/src/index.ts";
import { template as springer } from "../../template-springer/src/index.ts";
import {
  template as article,
  arabicTemplate,
} from "../../template-article/src/index.ts";
import { unzipSync } from "fflate";
const execute = promisify(execFile);
const directory = new URL("../../../examples/articles/", import.meta.url)
  .pathname;
async function fixture(name = "ieee-journal") {
  const result = fromMarkdown(
    await readFile(join(directory, `${name}.md`), "utf8"),
  );
  if (!result.document) throw new Error("Invalid fixture");
  return result.document;
}
describe("publisher starter packages", () => {
  for (const template of [article, acm, elsevier, authorDateTemplate, springer])
    it(`compiles and rebuilds ${template.id} from a clean source package`, async () => {
      const output = await mkdtemp(join(tmpdir(), "publisle-profile-"));
      try {
        const source = createLatexPackage(await fixture(), {
          template,
          data: { country: "Jordan" },
          style:
            template.id === "elsevier-author-date" ? "author-date" : "numeric",
        });
        const compiled = await compileLatexPackage(source, {
          sourceDirectory: directory,
          compiler: "native",
        });
        expect(compiled.pdf.length).toBeGreaterThan(10_000);
        await writeLatexPackage(
          {
            ...compiled,
            files: Object.fromEntries(
              Object.entries(compiled.files).filter(
                ([name]) =>
                  name !== "manuscript.pdf" &&
                  !name.endsWith(".log") &&
                  !name.endsWith(".bbl"),
              ),
            ),
          },
          join(output, "rebuild"),
        );
        await execute(
          "latexmk",
          [
            source.engine === "pdflatex" ? "-pdf" : "-lualatex",
            "-norc",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-no-shell-escape",
            "manuscript.tex",
          ],
          { cwd: join(output, "rebuild"), timeout: 120_000 },
        );
        const zip = join(output, "package.zip");
        await writePackageArchive(compiled, zip);
        expect(Object.keys(unzipSync(await readFile(zip)))).toContain(
          "assets/figure-1.pdf",
        );
      } finally {
        await rm(output, { recursive: true, force: true });
      }
    });
  it("compiles Arabic-first page flow and mixed scripts", async () => {
    const input = await fixture("ieee-unicode");
    const source = createLatexPackage(
      {
        ...input,
        metadata: { ...input.metadata, direction: "rtl", language: "ar" },
      },
      { template: arabicTemplate },
    );
    expect(source.files["manuscript.tex"]).toContain(
      "\\babelprovide[import,main]{arabic}",
    );
    const compiled = await compileLatexPackage(source, {
      sourceDirectory: directory,
      compiler: "native",
    });
    expect(compiled.pdf.length).toBeGreaterThan(10_000);
  });
  it("validates an article/assets JATS package offline", async () => {
    const result = await collectJatsPackage(
      createJatsPackage(resolveDocument(await fixture())),
      directory,
    );
    expect(result.files["article.xml"]).toContain(
      'xlink:href="assets/figure-1.pdf"',
    );
    expect(result.files["manifest.json"]).toContain("offline-dtd");
    const bad = {
      files: {
        "article.xml": String(result.files["article.xml"]).replace(
          "<article ",
          "<wrong ",
        ),
      },
      assets: [],
      diagnostics: [],
    };
    await expect(collectJatsPackage(bad, directory)).rejects.toThrow();
  });
  it.runIf(process.env["PUBLISLE_CONTAINER_TEST"] === "1")(
    "compiles the Unicode default using the installed pinned container",
    async () => {
      const source = createLatexPackage(await fixture("ieee-unicode"));
      const result = await compileLatexPackage(source, {
        sourceDirectory: directory,
        compiler: "container",
        timeoutMs: 180_000,
      });
      expect(result.files["manifest.json"]).toContain(
        '"compiler": "container"',
      );
      expect(result.pdf.length).toBeGreaterThan(10_000);
    },
  );
});
