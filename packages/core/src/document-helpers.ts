import {
  isPlainObject,
  type BlockId,
  type PreparedDocument,
  type PublicationMetadata,
  type ReferenceTarget,
} from "@publisle/schema";

export interface DocumentOutlineEntry {
  readonly blockId: BlockId;
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly title: string;
  readonly label?: string;
}

/** A detached copy of authored metadata; no inferred host/SEO fields. */
export function getDocumentMetadata(
  document: PreparedDocument,
): PublicationMetadata | undefined {
  return document.metadata === undefined
    ? undefined
    : structuredClone(document.metadata);
}

function inlineTitle(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((node: unknown): string => {
      if (!isPlainObject(node)) return "";
      switch (node["type"]) {
        case "text":
        case "inlineCode":
        case "inlineMath":
          return typeof node["value"] === "string" ? node["value"] : "";
        case "inlineImage":
          return typeof node["alt"] === "string" ? node["alt"] : "";
        case "hardBreak":
        case "softBreak":
          return " ";
        case "emphasis":
        case "strong":
        case "strikethrough":
        case "link":
        case "crossReference":
          return inlineTitle(node["children"]);
        default:
          return "";
      }
    })
    .join("");
}

/** Top-level portable headings in document order, including unlabeled headings. */
export function getDocumentOutline(
  document: PreparedDocument,
): readonly DocumentOutlineEntry[] {
  const outline: DocumentOutlineEntry[] = [];
  for (const block of document.blocks) {
    if (block.type !== "publisle:heading" || !isPlainObject(block.data))
      continue;
    const level = block.data["level"];
    if (
      level !== 1 &&
      level !== 2 &&
      level !== 3 &&
      level !== 4 &&
      level !== 5 &&
      level !== 6
    )
      continue;
    const label = block.data["label"];
    outline.push({
      blockId: block.id,
      level,
      title: inlineTitle(block.data["content"]),
      ...(typeof label === "string" ? { label } : {}),
    });
  }
  return outline;
}

/** Detached targets with preparation's labels, ordering, titles and numbering. */
export function getDocumentReferences(
  document: PreparedDocument,
): readonly ReferenceTarget[] {
  return structuredClone(document.references.targets);
}
