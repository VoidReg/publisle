import { expect, it } from "vitest";
import { compilePublication } from "@publisle/adapter-core";
import { prepare, createRegistry } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { fromMarkdown } from "@publisle/markdown";
import { resolveDocument } from "@publisle/research";
import { playgroundExamples } from "../src/lib/playground-examples";
import { previewCitations } from "../src/lib/preview-citations";

for (const example of playgroundExamples) {
  it(`formats ${example.id} citations and bibliography like PDF export`, () => {
    const document = fromMarkdown(example.markdown).document;
    if (!document) throw new Error("Invalid test fixture");
    const prepared = prepare(document, {
      registry: createRegistry([
        ...coreBlockDefinitions,
        interactiveSchematicDefinition,
      ]),
    }).document;
    if (!prepared) throw new Error("Invalid prepared fixture");
    const formatted = previewCitations(document);
    const artifact = compilePublication(prepared, formatted);
    const resolved = resolveDocument(document);
    for (const citation of resolved.citations)
      expect(artifact.html).toContain(`>${citation}</span>`);
    expect(artifact.html).not.toContain("[cooley1965]");
    expect(artifact.html).not.toContain("[gibbs1899]");
    for (const entry of resolved.bibliography)
      expect(formatted.bibliography).toContainEqual(entry);
    expect(compilePublication(prepared).html).not.toBe(artifact.html);
  });
}
