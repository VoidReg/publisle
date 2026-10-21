// Every loadable playground example must compile with the playground registry
// without error-level diagnostics, so a click in the playground never yields
// a broken document.
import { describe, expect, it } from "vitest";
import { playgroundExamples } from "../src/lib/playground-examples";
import { compilePublication } from "@publisle/adapter-core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry, prepare } from "@publisle/core";
import { fromMarkdown, toMarkdown } from "@publisle/markdown";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);

describe("playground examples", () => {
  for (const example of playgroundExamples) {
    it(`compiles without errors: ${example.title}`, () => {
      const imported = fromMarkdown(example.markdown, {
        sourceName: `${example.id}.md`,
      });
      const importErrors = imported.diagnostics.filter(
        (item) => item.level === "error",
      );
      expect(importErrors).toEqual([]);
      if (!imported.document) {
        throw new Error(`${example.title}: import produced no document.`);
      }

      const result = prepare(imported.document, { registry });
      const prepareErrors = result.diagnostics.filter(
        (item) => item.level === "error",
      );
      expect(prepareErrors).toEqual([]);
      if (!result.document) {
        throw new Error(`${example.title}: preparation produced no document.`);
      }

      const artifact = compilePublication(result.document);
      expect(
        imported.document.blocks.some(
          (block) => block.type === "publisle:raw-html",
        ),
      ).toBe(false);
      expect(artifact.html).not.toContain(":::");
      expect(artifact.html).not.toContain("::caption");
      expect(artifact.html).not.toContain("::fallback");
      const exported = toMarkdown(imported.document);
      expect(exported.markdown).toBeDefined();
      if (exported.markdown === undefined)
        throw new Error("Markdown export failed.");
      const roundTripped = fromMarkdown(exported.markdown);
      expect(
        roundTripped.document?.blocks.map(({ type, data }) => ({ type, data })),
      ).toEqual(
        imported.document.blocks.map(({ type, data }) => ({ type, data })),
      );
      expect(artifact.html.length).toBeGreaterThan(0);
    });
  }

  function compileExample(id: string) {
    const example = playgroundExamples.find((item) => item.id === id);
    if (!example) throw new Error(`Missing example: ${id}`);
    const document = fromMarkdown(example.markdown).document;
    if (!document) throw new Error(`Import failed: ${id}`);
    const prepared = prepare(document, { registry }).document;
    if (!prepared) throw new Error(`Preparation failed: ${id}`);
    return { document, artifact: compilePublication(prepared) };
  }

  it("research references have one label and equations expose numbered layout", () => {
    const { artifact } = compileExample("research-paper");
    expect(artifact.html).not.toMatch(/(Equation|Figure|Table)\s+<a[^>]*>\1 /u);
    expect(artifact.html).toMatch(/Equation <a[^>]*>2<\/a>/u);
    expect(artifact.html).toMatch(/Figure <a[^>]*>1<\/a>/u);
    expect(artifact.html).toMatch(/Table <a[^>]*>1<\/a>/u);
    expect(artifact.html).toContain("publisle-math-numbered");
  });

  it("the example set is the FFT tutorial plus a research paper", () => {
    expect(playgroundExamples.map((example) => example.id)).toEqual([
      "fft",
      "research-paper",
    ]);
    expect(new Set(playgroundExamples.map((e) => e.title)).size).toBe(
      playgroundExamples.length,
    );
  });

  it("follows research paper conventions", () => {
    const { document } = compileExample("research-paper");
    const types = document.blocks.map((block) => block.type);
    for (const type of [
      "publisle:heading",
      "publisle:paragraph",
      "publisle:math",
      "publisle:figure",
      "publisle:table",
      "publisle:footnote",
      "publisle:bibliography",
    ])
      expect(types).toContain(type);
    // An abstract heading carries the abstract role, and the genre stays
    // scholarly: no tutorial-genre blocks.
    const abstractHeading = document.blocks.find(
      (block) =>
        block.type === "publisle:heading" &&
        (block.data as Record<string, unknown>).role === "abstract",
    );
    expect(abstractHeading).toBeDefined();
    expect(types).not.toContain("publisle:callout");
    expect(types).not.toContain("publisle:embed");
    expect(types).not.toContain("publisle:interactive-schematic");
    expect(document.metadata?.documentType).toBe("research-paper");
    expect(document.metadata?.authors?.[0]).toMatchObject({
      name: "Ada Example",
      affiliation: "Illustrative Signal Processing Laboratory",
    });
  });

  it("carries every advertised block type in one document", () => {
    const { document } = compileExample("fft");
    const types = document.blocks.map((block) => block.type);
    for (const type of [
      "publisle:heading",
      "publisle:paragraph",
      "publisle:math",
      "publisle:figure",
      "publisle:table",
      "publisle:diagram",
      "publisle:embed",
      "publisle:callout",
      "publisle:list",
      "publisle:quote",
      "publisle:code",
      "publisle:footnote",
      "publisle:bibliography",
      "publisle:interactive-schematic",
    ])
      expect(types).toContain(type);
  });

  it("keeps colored LaTeX, labels, and cross-references in the compiled HTML", () => {
    const { artifact } = compileExample("fft");
    // KaTeX renders \textcolor as an inline color style.
    expect(artifact.html).toContain("katex");
    expect(artifact.html).toContain("color:");
    expect(artifact.html).toContain('data-publisle-id="reference-eq:dft"');
    expect(artifact.html).toContain(
      'data-publisle-id="reference-fig:spectrum"',
    );
    expect(artifact.html).toContain('data-publisle-id="reference-tab:stages"');
    expect(artifact.html).toContain('data-publisle-id="reference-sec:dft"');
    expect(artifact.html).toContain('data-publisle-ref="reference-eq:dft"');
    expect(artifact.html).toContain(
      'data-publisle-ref="reference-fig:spectrum"',
    );
  });

  it("keeps figure and table captions and accessible headers", () => {
    const { document, artifact } = compileExample("fft");
    const figure = document.blocks.find(
      (block) => block.type === "publisle:figure",
    );
    expect(figure?.data).toMatchObject({
      src: "/fft-spectrum.svg",
      caption: [{ type: "paragraph" }],
    });
    const table = document.blocks.find(
      (block) => block.type === "publisle:table",
    );
    expect(table?.data).toMatchObject({
      headerRows: 1,
      caption: [{ type: "paragraph" }],
    });
    expect(artifact.html).toContain(
      '<figcaption><span class="publisle-figure-number">Figure 1. </span><p>The magnitude spectrum of the sampled square wave.',
    );
    expect(artifact.html).toContain('<th scope="col">Block size</th>');
  });

  it("preserves diagram and embed fallback content", () => {
    const { artifact } = compileExample("fft");
    expect(artifact.html).toContain(
      "Samples in bit-reversed order pass through three butterfly stages",
    );
    // Website builds render the privacy-preserving YouTube iframe directly.
    expect(artifact.html).toContain(
      'iframe src="https://www.youtube-nocookie.com/embed/spUNpyF58BY"',
    );
  });

  it("publishes an interaction-activated FFT butterfly with fallback", () => {
    const { artifact } = compileExample("fft");
    expect(artifact.islands).toHaveLength(1);
    expect(artifact.islands[0]).toMatchObject({
      implementation: "publisle:interactive-schematic",
      activation: "interaction",
      mode: "mount",
    });
    expect(artifact.html).toContain(
      "Eight samples [1, 0, -1, 0, 1, 0, -1, 0] transform into a spectrum",
    );
    expect(artifact.html).toContain(
      "Explore Eight-point FFT butterfly</button>",
    );
    expect(artifact.html).toContain("data-publisle-activate");
  });

  it("keeps the FFT island payload as validated data pointing at its resource", () => {
    const { document } = compileExample("fft");
    const island = document.blocks.find(
      (block) => block.type === "publisle:interactive-schematic",
    );
    expect(island?.data).toMatchObject({
      payload: { source: "/fft-butterfly.json" },
    });
  });
});
