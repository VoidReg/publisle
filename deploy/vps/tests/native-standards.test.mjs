import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromMarkdown } from "../../../packages/markdown/src/index.ts";
import { compileNativePdf } from "../../../packages/research/src/native-node.ts";
import { NATIVE_PDF_TEMPLATES } from "../../../packages/research/src/native.ts";
import { validatePdf } from "../../../tools/validate-pdf-ua.mjs";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
test(
  "Node API emits and independently validates UA-1 and UA-2 for every native profile",
  {
    skip:
      !process.env.PUBLISLE_NATIVE_COMPILER || !process.env.PDF_TEST_VERAPDF,
    timeout: 300000,
  },
  async () => {
    const temporary = await mkdtemp(
      join(tmpdir(), "publisle-native-standards-"),
    );
    const artifacts = process.env.PDF_TEST_ARTIFACTS ?? temporary;
    await mkdir(artifacts, { recursive: true });
    try {
      for (const template of NATIVE_PDF_TEMPLATES) {
        const arabic = template === "article-arabic";
        const input = fromMarkdown(
          await readFile(
            join(
              root,
              "examples/articles",
              arabic ? "article-arabic.md" : "ieee-journal.md",
            ),
            "utf8",
          ),
        ).document;
        assert(input);
        for (const pdfUa of ["ua-1", "ua-2"]) {
          const result = await compileNativePdf(input, {
            template,
            pdfUa,
            sourceDirectory: join(root, "examples/articles"),
            data: { country: "Jordan" },
          });
          assert.equal(
            Buffer.from(result.pdf.slice(0, 8)).toString(),
            pdfUa === "ua-1" ? "%PDF-1.7" : "%PDF-2.0",
          );
          const path = join(artifacts, `${template}-${pdfUa}.pdf`);
          await writeFile(path, result.pdf);
          const structure = (await execute("pdfinfo", ["-struct", path]))
            .stdout;
          assert(structure.includes("Formula"), structure);
          assert(structure.includes("Figure"), structure);
          await validatePdf(path, {
            validator: process.env.PDF_TEST_VERAPDF,
            flavour: pdfUa === "ua-1" ? "ua1" : "ua2",
            report: join(artifacts, `${template}-${pdfUa}.xml`),
          });
        }
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
