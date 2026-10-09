import { describe, expect, it } from "vitest";
import {
  coreBlockDefinitions,
  figure,
  heading,
  paragraph,
  table,
} from "../../../blocks/core/src/index.ts";
import {
  createBlock,
  document,
  type PublicationMetadata,
} from "@publisle/schema";
import { createRegistry, prepare } from "../../core/src/index.ts";
import { accessibilityProfile } from "../src/index.ts";

const registry = createRegistry(coreBlockDefinitions);
const text = (value: string) => [{ type: "text" as const, value }];

type DocumentInput = Parameters<typeof document>[0];
const article = (
  metadata: PublicationMetadata,
  blocks: DocumentInput["blocks"],
) => document({ metadata, blocks });

describe("accessibility profile v2", () => {
  it("reports missing document language once per document", () => {
    const result = prepare(
      article({ title: "T" }, [paragraph({ content: text("Body") })]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(
      result.diagnostics.filter(
        ({ code }) => code === "missing-document-language",
      ),
    ).toHaveLength(1);
  });

  it("does not report language when declared", () => {
    const result = prepare(
      article({ title: "T", language: "en" }, [
        paragraph({ content: text("Body") }),
      ]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("flags heading level jumps from the document start", () => {
    const result = prepare(
      article({ title: "T", language: "en" }, [
        heading({ level: 1, content: text("Title") }),
        heading({ level: 3, content: text("Skips level 2") }),
      ]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "irregular-heading-hierarchy",
        level: "warning",
        profile: "accessibility",
      }),
    );
  });

  it("flags tables without captions", () => {
    const result = prepare(
      article({ title: "T", language: "en" }, [
        table({
          align: [null, null],
          rows: [
            [text("A"), text("B")],
            [text("1"), text("2")],
          ],
        }),
      ]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "table-without-caption" }),
    );
  });

  it("flags links without accessible names", () => {
    const result = prepare(
      article({ title: "T", language: "en" }, [
        paragraph({
          content: [
            {
              type: "link",
              url: "https://example.com",
              children: [],
            },
            { type: "text", value: " end" },
          ],
        }),
      ]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "link-without-accessible-name" }),
    );
  });

  it("accepts links named by an image alt", () => {
    const result = prepare(
      article({ title: "T", language: "en" }, [
        paragraph({
          content: [
            {
              type: "link",
              url: "https://example.com",
              children: [
                { type: "inlineImage", url: "logo.svg", alt: "Example" },
              ],
            },
          ],
        }),
      ]),
      { registry, profiles: [accessibilityProfile()] },
    );
    expect(
      result.diagnostics.filter(
        ({ code }) => code === "link-without-accessible-name",
      ),
    ).toEqual([]);
  });

  it("keeps figure alt findings at warning severity and policy-mappable", () => {
    const doc = article({ title: "T", language: "en" }, [
      figure({ src: "plot.svg" }),
    ]);
    const warned = prepare(doc, {
      registry,
      profiles: [accessibilityProfile()],
    });
    expect(
      warned.diagnostics
        .filter(({ code }) => code === "missing-alternative-text")
        .map(({ level }) => level),
    ).toEqual(["warning"]);
    const errored = prepare(doc, {
      registry,
      profiles: [accessibilityProfile()],
      diagnosticPolicy: { "missing-alternative-text": "error" },
    });
    expect(errored.document).toBeUndefined();
    const allowed = createBlock({
      type: "publisle:figure",
      schemaVersion: 1,
      data: { src: "decorative.svg", alt: "" },
    });
    expect(
      prepare(
        document({
          metadata: { title: "T", language: "en" },
          blocks: [allowed],
        }),
        { registry, profiles: [accessibilityProfile()] },
      ).diagnostics.filter(({ code }) => code === "missing-alternative-text"),
    ).toEqual([]);
  });
});
