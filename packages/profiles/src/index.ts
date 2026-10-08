import type { Diagnostic, PublicationProfile } from "@publisle/schema";

export type { PublicationProfile } from "@publisle/schema";

export interface ResearchPaperProfileOptions {
  /** Match this heading label instead of the default "Abstract" title/"abstract" label. */
  readonly abstractLabel?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function plainText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      const node = record(entry);
      return node["type"] === "text" && typeof node["value"] === "string"
        ? node["value"]
        : plainText(node["children"]);
    })
    .join("");
}

/** Checks figure descriptions only; not a comprehensive accessibility audit. */
export function accessibilityProfile(): PublicationProfile {
  return {
    name: "accessibility",
    version: "1",
    inspect(document) {
      return document.blocks.flatMap((block): Diagnostic[] =>
        block.type === "publisle:figure" &&
        record(block.data)["alt"] === undefined
          ? [
              {
                level: "warning",
                code: "missing-alternative-text",
                message: "A figure is missing alternative text.",
                blockId: block.id,
              },
            ]
          : [],
      );
    },
  };
}

export function researchPaperProfile(
  options: ResearchPaperProfileOptions = {},
): PublicationProfile {
  return {
    name: "research-paper",
    version: JSON.stringify(["2", options.abstractLabel ?? null]),
    inspect(document) {
      const diagnostics: Diagnostic[] = [];
      if (!document.metadata?.title?.trim())
        diagnostics.push({
          level: "warning",
          code: "missing-title",
          message: "A research paper should provide a title.",
        });
      if (!document.metadata?.authors?.length)
        diagnostics.push({
          level: "warning",
          code: "missing-authors",
          message: "A research paper should provide at least one author.",
        });
      for (const author of document.metadata?.authors ?? []) {
        if (!author.affiliation?.trim())
          diagnostics.push({
            level: "warning",
            code: "missing-affiliation",
            message: `Author ${author.name} should provide an affiliation.`,
          });
      }
      let hasAbstract = false;
      let previousLevel = 0;
      for (const [index, block] of document.blocks.entries()) {
        const data = record(block.data);
        if (block.type === "publisle:heading") {
          const level = data["level"];
          if (typeof level === "number") {
            if (level > previousLevel + 1)
              diagnostics.push({
                level: "warning",
                code: "irregular-heading-hierarchy",
                message: `Heading level ${String(level)} skips a level after ${previousLevel === 0 ? "the start of the document" : `level ${String(previousLevel)}`}.`,
                blockId: block.id,
              });
            previousLevel = level;
          }
          const abstractHeading =
            options.abstractLabel === undefined
              ? data["label"] === "abstract" ||
                plainText(data["content"]).trim().toLowerCase() === "abstract"
              : data["label"] === options.abstractLabel;
          const next = document.blocks[index + 1];
          if (
            abstractHeading &&
            next?.type === "publisle:paragraph" &&
            plainText(record(next.data)["content"]).trim()
          )
            hasAbstract = true;
        }
      }
      diagnostics.push(...accessibilityProfile().inspect(document));
      if (!hasAbstract)
        diagnostics.push({
          level: "warning",
          code: "missing-abstract",
          message:
            "A research paper should provide an abstract heading followed by a nonempty paragraph.",
        });
      return diagnostics;
    },
  };
}
