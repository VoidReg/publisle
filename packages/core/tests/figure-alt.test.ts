import { describe, expect, it } from "vitest";
import {
  coreBlockDefinitions,
  figure,
  figureDefinition,
} from "@publisle/blocks-core";
import { createBlock, document } from "@publisle/schema";
import { createRegistry, prepare } from "../src/index.ts";
import { accessibilityProfile } from "../../profiles/src/index.ts";
import {
  fromMarkdown,
  formatMarkdown,
  toMarkdown,
} from "../../markdown/src/index.ts";
import { compilePublication } from "../../adapter-core/src/index.ts";

const registry = createRegistry(coreBlockDefinitions);

describe("figure alternative-text policy", () => {
  it("preserves missing, decorative, and descriptive alt through schema and builders", () => {
    expect(figureDefinition.schema.parse({ src: "figure.svg" })).toEqual({
      src: "figure.svg",
    });
    expect(figure({ src: "figure.svg" }).data).not.toHaveProperty("alt");
    expect(figure({ src: "figure.svg", alt: "" }).data).toHaveProperty(
      "alt",
      "",
    );
    expect(figure({ src: "figure.svg", alt: "A wave" }).data).toHaveProperty(
      "alt",
      "A wave",
    );
  });

  it.each([null, 123, false, [], {}].map((alt) => ({ alt })))(
    "rejects non-string alt $alt",
    ({ alt }) => {
      expect(() =>
        figureDefinition.schema.parse({ src: "figure.svg", alt }),
      ).toThrow();
      const result = prepare(
        document({
          blocks: [
            createBlock({
              type: "publisle:figure",
              data: { src: "figure.svg", alt },
            }),
          ],
        }),
        {
          registry,
          profiles: [accessibilityProfile()],
          diagnosticPolicy: { "missing-alternative-text": "info" },
        },
      );
      expect(result.document).toBeUndefined();
      expect(result.diagnostics[0]?.code).toBe("invalid-block-data");
    },
  );

  it("accepts undescribed figures without profiles and does not mutate source", () => {
    const input = document({ blocks: [figure({ src: "figure.svg" })] });
    const original = structuredClone(input);
    const result = prepare(input, { registry });
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.blocks[0]?.data).not.toHaveProperty("alt");
    expect(input).toEqual(original);
  });

  it.each(["info", "warning", "error"] as const)(
    "allows %s missing-alt policy with provenance and source location",
    (level) => {
      const imported = fromMarkdown(':::figure{src="figure.svg"}\n:::\n', {
        sourceName: "figure.md",
      });
      for (const profile of [accessibilityProfile()]) {
        const result = prepare(imported.document!, {
          registry,
          sourceMap: imported.sourceMap!,
          profiles: [profile],
          diagnosticPolicy: { "missing-alternative-text": level },
        });
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: "missing-alternative-text",
            level,
            profile: profile.name,
            blockId: imported.document!.blocks[0]!.id,
            sourceLocation: {
              source: "figure.md",
              line: 1,
              column: 1,
              offset: 0,
            },
          }),
        );
        expect(result.document !== undefined).toBe(level !== "error");
      }
    },
  );

  it("does not flag explicit empty or descriptive alt in either form", () => {
    const input = document({
      blocks: [
        figure({ src: "a.svg", alt: "" }),
        figure({ src: "b.svg", alt: "A wave" }),
      ],
    });
    for (const profile of [accessibilityProfile()]) {
      expect(
        prepare(input, { registry, profiles: [profile] }).diagnostics.filter(
          ({ code }) => code === "missing-alternative-text",
        ),
      ).toEqual([]);
    }
  });

  it.each([undefined, "", "A wave"])(
    "round-trips alt %j without inventing descriptions",
    (alt) => {
      const block = figure({
        src: "figure.svg",
        ...(alt === undefined ? {} : { alt }),
      });
      const exported = toMarkdown(document({ blocks: [block] }));
      expect(exported.diagnostics).toEqual([]);
      const imported = fromMarkdown(exported.markdown!);
      expect(imported.diagnostics).toEqual([]);
      expect(imported.document!.blocks[0]?.data).toEqual(block.data);
      expect(formatMarkdown(exported.markdown!).markdown).toBe(
        exported.markdown,
      );
      if (alt === undefined) {
        expect(exported.markdown).toContain(":::figure");
        expect(exported.markdown).not.toContain("alt=");
      }
    },
  );

  it("preserves absent versus explicit empty alt in captioned directives", () => {
    for (const alt of [undefined, ""]) {
      const block = figure({
        src: "figure.svg",
        caption: [
          { type: "paragraph", content: [{ type: "text", value: "Caption" }] },
        ],
        ...(alt === undefined ? {} : { alt }),
      });
      expect(
        fromMarkdown(toMarkdown(document({ blocks: [block] })).markdown!)
          .document!.blocks[0]?.data,
      ).toEqual(block.data);
    }
  });

  it("renders a visible missing-description notice without treating it as decorative", () => {
    const input = document({ blocks: [figure({ src: "figure.svg" })] });
    const prepared = prepare(input, { registry }).document!;
    const publication = compilePublication(prepared);
    expect(publication.html).toContain('alt="Figure description missing."');
    expect(publication.html).toContain(
      'class="publisle-figure-missing-alt">Figure description missing.</p>',
    );
    expect(publication.html).not.toContain('alt=""');
    expect(input.blocks[0]?.data).not.toHaveProperty("alt");
    expect(prepared.blocks[0]?.data).not.toHaveProperty("alt");
    for (const alt of ["", "A wave"]) {
      const html = compilePublication(
        prepare(document({ blocks: [figure({ src: "figure.svg", alt })] }), {
          registry,
        }).document!,
      ).html;
      expect(html).toContain(`alt="${alt}"`);
      expect(html).not.toContain("publisle-figure-missing-alt");
    }
  });

  it("uses an honest placeholder in lossy standard Markdown export", () => {
    const input = document({
      blocks: [
        figure({ src: "figure.svg" }),
        figure({ src: "decorative.svg", alt: "" }),
      ],
    });
    const exported = toMarkdown(input, { policy: "standard" });
    expect(exported.markdown).toContain(
      "![Figure description missing.](figure.svg)",
    );
    expect(exported.markdown).toContain("![](decorative.svg)");
    expect(exported.diagnostics.map(({ code }) => code)).toEqual([
      "extension-semantics-lost",
      "extension-semantics-lost",
    ]);
    expect(input.blocks[0]?.data).not.toHaveProperty("alt");
  });
});
