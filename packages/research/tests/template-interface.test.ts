import { it, expect } from "vitest";
import { document } from "@publisle/schema";
import { createSubmissionPackage } from "../src/package.ts";
import type { PublishingTemplate } from "../../template-sdk/src/index.ts";
it("allows a host template outside research to validate data and render a source package", () => {
  const template: PublishingTemplate = {
    id: "host:journal",
    version: "3",
    format: "latex",
    engines: ["lualatex"],
    languages: ["ar"],
    directions: ["rtl"],
    bibliographyMode: "csl",
    requiredMetadata: ["title"],
    validate(article, context) {
      if (!article.title || context.data?.["issue"] !== 42)
        throw new Error("Missing journal data");
      return [];
    },
    render(article) {
      return {
        template: "host:journal",
        templateVersion: "3",
        format: "latex",
        engine: "lualatex",
        requirements: ["article.cls"],
        fonts: {},
        files: { "manuscript.tex": article.title ?? "" },
        assets: [],
        diagnostics: [],
      };
    },
  };
  const source = document({ metadata: { title: "Host supplied" }, blocks: [] });
  expect(
    createSubmissionPackage(source, {
      template: "host:journal",
      templates: { "host:journal": template },
      data: { issue: 42 },
    }).files["manuscript.tex"],
  ).toBe("Host supplied");
  expect(() =>
    createSubmissionPackage(source, { template, data: { issue: 41 } }),
  ).toThrow("Missing journal data");
  expect(() =>
    createSubmissionPackage(source, { template, engine: "pdflatex" }),
  ).toThrow("Unsupported engine");
});
it("defaults to Unicode LaTeX and refuses unknown templates", () => {
  const source = document({
    metadata: { title: "مرحبا 中文 ∑", authors: [{ name: "Author" }] },
    blocks: [],
  });
  expect(createSubmissionPackage(source).engine).toBe("lualatex");
  expect(createSubmissionPackage(source).files["manuscript.tex"]).toContain(
    "fontspec",
  );
  expect(() =>
    createSubmissionPackage(source, { template: "missing" }),
  ).toThrow("Unknown export template");
});
