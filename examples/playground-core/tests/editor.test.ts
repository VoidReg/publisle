import { describe, expect, it } from "vitest";
import { compilePublication } from "@publisle/adapter-core";
import { prepare } from "@publisle/core";
import { CORE_REGISTRY, DocumentEditor } from "../src/editor.ts";

describe("playground editor", () => {
  it("round-trips a heading and schematic into one publication", () => {
    const editor = new DocumentEditor();
    editor.addBlock("publisle:heading");
    editor.addBlock("publisle:interactive-schematic");
    const heading = editor.document.blocks[0];
    if (heading?.type !== "publisle:heading")
      throw new Error("Expected a heading.");
    const data = heading.data as { level?: number; content?: unknown };
    editor.updateBlock(heading.id, { ...data, level: 1 });

    const exported = editor.exportMarkdown();
    if (!exported.markdown) throw new Error("Expected Markdown.");
    const restored = new DocumentEditor();
    const imported = restored.importMarkdown(exported.markdown);
    expect(
      imported.diagnostics.filter((item) => item.level === "error"),
    ).toEqual([]);
    expect(restored.document.blocks.map((block) => block.type)).toEqual([
      "publisle:heading",
      "publisle:interactive-schematic",
    ]);
    expect(restored.document.blocks[0]?.data).toMatchObject({ level: 1 });

    const prepared = prepare(editor.document, { registry: CORE_REGISTRY });
    if (!prepared.document) throw new Error("Expected a prepared document.");
    const publication = compilePublication(prepared.document);
    expect(publication.html.match(/data-publisle-root/gu) ?? []).toHaveLength(
      1,
    );
    expect(publication.html).toContain("Heading");
    expect(publication.html).toContain("The counter starts at zero.");
    expect(publication.html).not.toContain("counter.json");
    expect(publication.islands).toEqual([
      expect.objectContaining({
        implementation: "publisle:interactive-schematic",
        mode: "mount",
      }),
    ]);
  });
});
