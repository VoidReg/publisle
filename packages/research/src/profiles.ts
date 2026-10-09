import {
  type Diagnostic,
  type PublicationProfile,
  type ProfileContext,
  type Block,
  type Document,
} from "@publisle/schema";
import { accessibilityProfile } from "@publisle/profiles";

export type { PublicationProfile } from "@publisle/profiles";

export interface ResearchPaperProfileOptions {
  /** Match this heading label instead of the default "Abstract" title/"abstract" label. */
  readonly abstractLabel?: string;
}

function contentBlocks(
  document: Document<Block<`${string}:${string}`, unknown>>,
  context?: ProfileContext,
) {
  return context
    ? context.traversal
        .filter(
          (visit) =>
            visit.kind === "node" &&
            [
              "heading",
              "paragraph",
              "figure",
              "table",
              "list",
              "quote",
              "code",
              "math",
              "diagram",
              "callout",
              "embed",
              "divider",
              "footnote",
              "raw-html",
            ].includes(visit.type ?? ""),
        )
        .map((visit) => ({
          id: visit.blockId,
          type: `publisle:${visit.type ?? ""}`,
          data: visit.value,
        }))
    : document.blocks;
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

export function researchPaperProfile(
  options: ResearchPaperProfileOptions = {},
): PublicationProfile {
  return {
    name: "research-paper",
    version: JSON.stringify(["2", options.abstractLabel ?? null]),
    inspect(document, context) {
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
      const blocks = contentBlocks(document, context);
      for (const [index, block] of blocks.entries()) {
        const data = record(block.data);
        if (block.type === "publisle:heading") {
          const abstractHeading =
            data["role"] === "abstract" ||
            (options.abstractLabel === undefined
              ? data["label"] === "abstract" ||
                plainText(data["content"]).trim().toLowerCase() === "abstract"
              : data["label"] === options.abstractLabel ||
                data["role"] === "abstract");
          const next = blocks[index + 1];
          if (
            abstractHeading &&
            next?.type === "publisle:paragraph" &&
            plainText(record(next.data)["content"]).trim()
          )
            hasAbstract = true;
        }
      }
      diagnostics.push(...accessibilityProfile().inspect(document, context));
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

function walkCitations(value: unknown, found: { id: string }[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) walkCitations(entry, found);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node["type"] === "citationReference" && Array.isArray(node["items"])) {
    for (const item of node["items"]) {
      const id = record(item)["id"];
      if (typeof id === "string") found.push({ id });
    }
  }
  for (const entry of Object.values(node)) walkCitations(entry, found);
}

/** Optional citation targets and section roles. Metadata stays informational. */
export function scholarlyProfile(): PublicationProfile {
  return {
    name: "scholarly",
    version: "1",
    inspect(document) {
      const diagnostics: Diagnostic[] = [];
      const entries = new Set<string>();
      for (const block of document.blocks) {
        if (block.type !== "publisle:bibliography") continue;
        const listed = record(block.data)["entries"];
        if (!Array.isArray(listed)) continue;
        for (const entry of listed) {
          const id = record(entry)["id"];
          if (typeof id !== "string") continue;
          if (entries.has(id))
            diagnostics.push({
              level: "warning",
              code: "duplicate-bibliography-entry",
              message: `Bibliography id ${id} is repeated.`,
              blockId: block.id,
            });
          entries.add(id);
        }
      }
      for (const block of document.blocks) {
        const citations: { id: string }[] = [];
        walkCitations(block.data, citations);
        for (const citation of citations) {
          if (!entries.has(citation.id))
            diagnostics.push({
              level: "warning",
              code: "unresolved-citation",
              message: `Citation ${citation.id} has no bibliography entry. The reference stays in the source.`,
              blockId: block.id,
            });
        }
      }
      return diagnostics;
    },
  };
}
