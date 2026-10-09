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

/**
 * Automatable presence checks mapped to WCAG 2.2 success criteria. Presence and
 * references only: this profile is not a WCAG conformance claim, and usable
 * keyboard/motion/announcement behavior needs browser or manual review.
 * Diagram alternative text and embed titles are already structural schema
 * requirements, so they are enforced at preparation, not rechecked here. Math
 * accessibility is a renderer contract (MathML or a text alternative in every
 * output), not a preparation check. All findings warn by default and stay
 * policy-mappable per the preparation contract.
 */
export function accessibilityProfile(): PublicationProfile {
  return {
    name: "accessibility",
    version: "2",
    inspect(document, context) {
      const diagnostics: Diagnostic[] = [];
      if (!document.metadata?.language?.trim())
        diagnostics.push({
          level: "warning",
          code: "missing-document-language",
          message:
            "Document metadata should declare a language for assistive technology (WCAG 3.1.1).",
        });
      let previousLevel = 0;
      for (const block of contentBlocks(document, context)) {
        const data = record(block.data);
        if (block.type === "publisle:heading") {
          const level = data["level"];
          if (typeof level === "number") {
            if (level > previousLevel + 1)
              diagnostics.push({
                level: "warning",
                code: "irregular-heading-hierarchy",
                message: `Heading level ${String(level)} skips a level after ${previousLevel === 0 ? "the start of the document" : `level ${String(previousLevel)}`} (WCAG 1.3.1, 2.4.6).`,
                blockId: block.id,
              });
            previousLevel = level;
          }
        }
        if (block.type === "publisle:figure" && data["alt"] === undefined)
          diagnostics.push({
            level: "warning",
            code: "missing-alternative-text",
            message: "A figure is missing alternative text (WCAG 1.1.1).",
            blockId: block.id,
          });
        if (block.type === "publisle:table" && data["caption"] === undefined)
          diagnostics.push({
            level: "warning",
            code: "table-without-caption",
            message:
              "A table has no caption; header rows and captions explain table structure (WCAG 1.3.1).",
            blockId: block.id,
          });
        walkNodes(data, (node) => {
          if (
            node["type"] === "link" &&
            !hasAccessibleName(node) &&
            !hasNamedImage(node)
          )
            diagnostics.push({
              level: "warning",
              code: "link-without-accessible-name",
              message:
                "A link has no text or named image content (WCAG 2.4.4).",
              blockId: block.id,
            });
        });
      }
      return diagnostics;
    },
  };
}

function walkNodes(
  value: unknown,
  visit: (node: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) walkNodes(entry, visit);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (typeof node["type"] === "string") visit(node);
  for (const key of ["children", "content", "caption", "cells", "items"]) {
    if (node[key] !== undefined) walkNodes(node[key], visit);
  }
}

function hasAccessibleName(node: Record<string, unknown>): boolean {
  return flowText(node["children"]).trim().length > 0;
}

function hasNamedImage(node: Record<string, unknown>): boolean {
  let named = false;
  walkNodes(node["children"], (child) => {
    if (
      (child["type"] === "inlineImage" || child["type"] === "image") &&
      typeof child["alt"] === "string" &&
      child["alt"].trim().length > 0
    )
      named = true;
  });
  return named;
}

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
