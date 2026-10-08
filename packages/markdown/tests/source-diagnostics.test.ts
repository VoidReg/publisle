import { describe, expect, it } from "vitest";
import { createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRenderPlan } from "../../adapter-core/src/render-plan.ts";
import { fromMarkdown, toMarkdown } from "../src/index.ts";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);
const fence = "`".repeat(3);
const scene = `:::interactive{type="publisle:interactive-schematic" schemaVersion="2"}\n${fence}publisle-payload\n{"source":"counter.json"}\n${fence}\n:::\n\n`;

describe("original-source diagnostic locations", () => {
  it("tracks original offsets after expanded interactive fences and keeps maps outside semantics", () => {
    const source = `# Title\n\n${scene}After the island.\n`;
    const imported = fromMarkdown(source, { sourceName: "article.md" });
    expect(imported.diagnostics).toEqual([]);
    const last = imported.document!.blocks.at(-1)!;
    expect(imported.sourceMap?.blocks[last.id]).toEqual({
      source: "article.md",
      line: 9,
      column: 1,
      offset: source.indexOf("After the island."),
    });
    expect(imported.document).not.toHaveProperty("sourceMap");
    expect(toMarkdown(imported.document!).markdown).not.toContain("sourceMap");
  });

  it("locates malformed imported payloads at their owning block", () => {
    const imported = fromMarkdown(
      `# Title\n\n:::interactive{type="demo:broken"}\n${fence}publisle-payload\n{invalid}\n${fence}\n:::\n`,
      { sourceName: "bad.md" },
    );
    expect(imported.document).toBeUndefined();
    expect(imported.diagnostics[0]?.sourceLocation).toEqual({
      source: "bad.md",
      line: 3,
      column: 1,
      offset: 9,
    });
  });

  it("locates frontmatter and invalid directive IDs rather than throwing", () => {
    const badMetadata = fromMarkdown("---\ntitle: 123\n---\n", {
      sourceName: "metadata.md",
    });
    expect(badMetadata.diagnostics[0]?.sourceLocation?.source).toBe(
      "metadata.md",
    );
    const badId = fromMarkdown(
      '# Title\n\n:::figure{src="x.svg" alt="Image" id="bad-id"}\n:::\n',
      { sourceName: "id.md" },
    );
    expect(badId.document).toBeUndefined();
    expect(badId.diagnostics[0]?.sourceLocation?.line).toBe(3);
  });

  it("preserves block IDs and locations through unresolved-reference validation", () => {
    const source = '# Title\n\nSee :ref[]{target="missing"}.\n';
    const imported = fromMarkdown(source, { sourceName: "references.md" });
    const result = prepare(imported.document!, {
      registry,
      sourceMap: imported.sourceMap!,
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unresolved-cross-reference",
        blockId: imported.document!.blocks[1]!.id,
        sourceLocation: {
          source: "references.md",
          line: 3,
          column: 1,
          offset: 9,
        },
      }),
    );
  });

  it("distinguishes failed block migrations from current-schema validation errors", () => {
    const imported = fromMarkdown(
      `:::interactive{type="publisle:interactive-schematic" schemaVersion="1"}\n${fence}publisle-payload\n{"source":"counter.json"}\n${fence}\n:::\n`,
      { sourceName: "migration.md" },
    );
    const badMigration = createRegistry([
      {
        ...interactiveSchematicDefinition,
        migrations: [
          {
            from: 1,
            migrate() {
              throw new Error("Migration crashed");
            },
          },
        ],
      },
    ]);
    const original = structuredClone(imported.document);
    const failed = prepare(imported.document!, {
      registry: badMigration,
      sourceMap: imported.sourceMap!,
    });
    expect(failed.diagnostics[0]).toMatchObject({
      code: "migration-failed",
      blockId: imported.document!.blocks[0]!.id,
      sourceLocation: { source: "migration.md", line: 1 },
    });
    expect(imported.document).toEqual(original);
    const current = fromMarkdown(scene.replace('"counter.json"', "123"));
    expect(
      prepare(current.document!, { registry, sourceMap: current.sourceMap! })
        .diagnostics[0]?.code,
    ).toBe("invalid-block-data");
  });

  it("attaches original locations to renderer diagnostics and preserves code-authored defaults", () => {
    const imported = fromMarkdown("# Title\n\n$\\unknownCommand$\n", {
      sourceName: "math.md",
    });
    const prepared = prepare(imported.document!, {
      registry,
      sourceMap: imported.sourceMap!,
    }).document!;
    const plan = createRenderPlan(prepared);
    expect(plan.diagnostics[0]).toMatchObject({
      sourceLocation: { source: "math.md", line: 3, column: 1, offset: 9 },
      blockId: imported.document!.blocks[1]!.id,
    });
    const unmapped = prepare(imported.document!, { registry }).document!;
    expect(createRenderPlan(unmapped).diagnostics[0]).not.toHaveProperty(
      "sourceLocation",
    );
  });

  it("preserves unsupported source text after an interactive fence", () => {
    const unsupported = ":::unknown\nKeep this exact text.\n:::\n";
    const imported = fromMarkdown(`${scene}${unsupported}`, {
      sourceName: "unknown.md",
    });
    expect(imported.document!.blocks.at(-1)?.data).toMatchObject({
      value: unsupported.trimEnd(),
    });
    expect(imported.diagnostics.at(-1)?.sourceLocation?.offset).toBe(
      scene.length,
    );
  });
});
