import type { Diagnostic, Document } from "@publisle/schema";

export interface PublicationProfile {
  readonly name: string;
  inspect(document: Document): readonly Diagnostic[];
}

export function researchPaperProfile(): PublicationProfile {
  return {
    name: "research-paper",
    inspect(document) {
      const diagnostics: Diagnostic[] = [];
      if (!document.metadata?.title)
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
      for (const block of document.blocks) {
        if (
          block.type === "publisle:figure" &&
          typeof block.data === "object" &&
          block.data !== null &&
          !Array.isArray(block.data) &&
          !("alt" in block.data)
        ) {
          diagnostics.push({
            level: "warning",
            code: "missing-alternative-text",
            message: "A research-paper figure should provide alternative text.",
            blockId: block.id,
          });
        }
      }
      return diagnostics;
    },
  };
}
