import {
  isPlainObject,
  type BlockId,
  type PreparedDocument,
  type PublicationMetadata,
  type ReferenceTarget,
  richText,
} from "@publisle/schema";

export interface DocumentOutlineEntry {
  readonly pointer?: string;
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

/** Declared portable headings, including nested content, in traversal order. */
export function getDocumentOutline(
  document: PreparedDocument,
): readonly DocumentOutlineEntry[] {
  const outline: DocumentOutlineEntry[] = [];
  const blocks = document.traversal
    ? document.traversal
        .filter((visit) => visit.kind === "node" && visit.type === "heading")
        .map((visit) => ({
          id: visit.blockId,
          type: "publisle:heading",
          data: visit.value,
          pointer: visit.pointer,
        }))
    : document.blocks;
  for (const block of blocks) {
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
      title: richText(block.data["content"]),
      ...("pointer" in block &&
      typeof block.pointer === "string" &&
      block.pointer
        ? { pointer: block.pointer }
        : {}),
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
