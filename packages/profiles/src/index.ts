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
