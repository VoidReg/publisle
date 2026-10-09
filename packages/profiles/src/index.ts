import {
  isInteractiveEnvelope,
  type Diagnostic,
  type PublicationProfile,
  type ProfileContext,
  type Block,
  type BlockId,
  type Document,
  type InteractiveEnvelope,
  type JsonValue,
} from "@publisle/schema";

export type { PublicationProfile } from "@publisle/schema";

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

function flowText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flowText).join(" ");
  if (value === null || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (
    (node["type"] === "text" ||
      node["type"] === "inlineCode" ||
      node["type"] === "inlineMath" ||
      node["type"] === "code") &&
    typeof node["value"] === "string"
  )
    return node["value"];
  return ["content", "children", "items", "caption", "description"]
    .map((key) => flowText(node[key]))
    .join(" ");
}

function hasRepresentativeStructure(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRepresentativeStructure);
  if (value === null || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (
    node["type"] === "table" ||
    node["type"] === "figure" ||
    node["type"] === "image" ||
    node["type"] === "inlineImage"
  )
    return true;
  return ["content", "children", "items", "rows", "cells", "caption"].some(
    (key) => hasRepresentativeStructure(node[key]),
  );
}

/** Presence only. A generic script notice is not an explanation of the article. */
function explanationKind(value: unknown): "substantive" | "generic" | "empty" {
  if (hasRepresentativeStructure(value)) return "substantive";
  const text = flowText(value).replace(/\s+/gu, " ").trim();
  if (!text) return "empty";
  const stripped = text
    .replace(/\bplease enable java\s*script\b[.!]?/giu, "")
    .replace(/\benable java\s*script\b[.!]?/giu, "")
    .replace(/\benable js\b[.!]?/giu, "")
    .replace(/\bjava\s*script is required\b[.!]?/giu, "")
    .replace(/\bthis content requires java\s*script\b[.!]?/giu, "")
    .replace(/[^a-z0-9]+/giu, "");
  return stripped.length > 0 ? "substantive" : "generic";
}

function interactiveDiagnostics(
  blockId: BlockId,
  envelope: InteractiveEnvelope<JsonValue>,
): Diagnostic[] {
  const content = envelope.content;
  const diagnostics: Diagnostic[] = [];
  const label = envelope.accessibility?.label?.trim() ?? "";
  const name = label.length > 0 ? label : flowText(content?.title).trim();
  if (!name)
    diagnostics.push({
      level: "error",
      code: "missing-accessible-name",
      message: "An interactive publication block needs a readable name.",
      blockId,
    });
  const purpose =
    flowText(content?.purpose).trim() || flowText(content?.description).trim();
  if (!purpose)
    diagnostics.push({
      level: "error",
      code: "missing-interactive-purpose",
      message:
        "An interactive publication block needs a purpose or description.",
      blockId,
    });
  const controlBearing =
    envelope.activation === "interaction" ||
    (content?.presets?.length ?? 0) > 0;
  if (controlBearing && !flowText(content?.instructions).trim())
    diagnostics.push({
      level: "error",
      code: "missing-control-instructions",
      message:
        "A control-bearing interactive block needs meaningful instructions.",
      blockId,
    });
  const explanation = explanationKind([
    envelope.fallback,
    content?.fallback,
    content?.presets?.map((preset) => preset.description),
  ]);
  if (explanation === "generic")
    diagnostics.push({
      level: "error",
      code: "generic-script-notice",
      message:
        "Enable JavaScript is not a substantive alternative for this interactive block.",
      blockId,
    });
  else if (explanation === "empty")
    diagnostics.push({
      level: "error",
      code: "insubstantial-fallback",
      message:
        "An interactive publication block needs prose, an explained figure or table, or representative states.",
      blockId,
    });
  return diagnostics;
}

/**
 * Publication checks for readable naming, purpose, control instructions and a
 * substantive alternative. Schema presence is not a WCAG conformance claim.
 * Archival preparation stays permissive by leaving this profile off.
 */
export function interactivePublicationProfile(): PublicationProfile {
  return {
    name: "interactive-publication",
    version: "1",
    inspect(document) {
      return document.blocks.flatMap((block): Diagnostic[] =>
        isInteractiveEnvelope(block.data)
          ? interactiveDiagnostics(block.id, block.data)
          : [],
      );
    },
  };
}

/** Checks figure descriptions only; not a comprehensive accessibility audit. */
export function accessibilityProfile(): PublicationProfile {
  return {
    name: "accessibility",
    version: "1",
    inspect(document, context) {
      return contentBlocks(document, context).flatMap((block): Diagnostic[] =>
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
      let previousLevel = 0;
      const blocks = contentBlocks(document, context);
      for (const [index, block] of blocks.entries()) {
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

/** Reports missing readable alternatives. It does not paginate or choose a renderer. */
export function printProfile(): PublicationProfile {
  return {
    name: "print",
    version: "1",
    inspect(document) {
      return document.blocks.flatMap((block): Diagnostic[] => {
        const data = record(block.data);
        const missing =
          (block.type === "publisle:diagram" &&
            data["fallback"] === undefined &&
            data["printFallback"] === undefined) ||
          (block.type === "publisle:embed" && data["fallback"] === undefined);
        return missing
          ? [
              {
                level: "warning",
                code: "missing-print-alternative",
                message:
                  "This block has no authored print alternative. Hosts decide pagination and whether to omit it.",
                blockId: block.id,
              },
            ]
          : [];
      });
    },
  };
}

/** Language and direction are source metadata, not a layout engine. */
export function localizationProfile(): PublicationProfile {
  return {
    name: "localization",
    version: "1",
    inspect(document) {
      if (document.metadata?.direction === undefined) return [];
      return [
        {
          level: "info",
          code: "host-direction-policy",
          message:
            "Direction and language are source metadata. This profile does not select a layout, font, or route.",
        },
      ];
    },
  };
}
