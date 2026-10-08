import {
  canonicalizeJson,
  parseJson,
  parseDocument,
  isPlainObject,
  SchemaParseError,
  type Document,
  type DocumentSourceMap,
} from "@publisle/schema";

/** Explicit lossless exchange grammar, distinct from the readable/native Markdown projection. */
export function toArchivalMarkdown(source: Document): string {
  const document = parseDocument(parseJson(canonicalizeJson(source)));
  if (canonicalizeJson(source) !== canonicalizeJson(document))
    throw new SchemaParseError(
      "unsupported-archival-fields",
      "Source contains unsupported envelope fields; retain original JSON instead of silently losing them. Use extensions for portable unknown fields.",
    );
  const { blocks, ...manifest } = document;
  return [
    "::::publisle-document",
    "~~~publisle-manifest",
    JSON.stringify(manifest, null, 2),
    "~~~",
    "",
    ...blocks.flatMap((block) => [
      ":::publisle-block",
      "~~~publisle-envelope",
      JSON.stringify(block, null, 2),
      "~~~",
      ":::",
      "",
    ]),
    "::::",
    "",
  ].join("\n");
}

export function fromArchivalMarkdown(
  source: string,
  sourceName?: string,
): { readonly document: Document; readonly sourceMap: DocumentSourceMap } {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let cursor = 0;
  const expect = (line: string) => {
    if (lines[cursor]?.trimEnd() !== line)
      throw new SchemaParseError(
        "invalid-archival-markdown",
        `Expected ${line} at line ${String(cursor + 1)}.`,
      );
    cursor++;
  };
  const blank = () => {
    while (lines[cursor]?.trim() === "") cursor++;
  };
  const fence = (language: string) => {
    const open = new RegExp(`^(~{3,}|\x60{3,})${language}$`, "u").exec(
      lines[cursor]?.trimEnd() ?? "",
    );
    const marker = open?.[1];
    if (!marker)
      throw new SchemaParseError(
        "invalid-archival-markdown",
        `Expected ${language} JSON fence at line ${String(cursor + 1)}.`,
      );
    cursor++;
    const start = cursor;
    while (cursor < lines.length && lines[cursor]?.trimEnd() !== marker)
      cursor++;
    if (cursor === lines.length)
      throw new SchemaParseError(
        "invalid-archival-markdown",
        "Unterminated archival JSON fence.",
      );
    const value = parseJson(lines.slice(start, cursor).join("\n"));
    cursor++;
    return value;
  };
  blank();
  const start = cursor;
  expect("::::publisle-document");
  const manifest = fence("publisle-manifest");
  if (!isPlainObject(manifest) || "blocks" in manifest)
    throw new SchemaParseError(
      "invalid-archival-markdown",
      "Manifest must be a document header without blocks.",
    );
  const blocks: unknown[] = [];
  const locations: Record<
    string,
    { line: number; column: number; source?: string }
  > = {};
  blank();
  while (lines[cursor]?.trimEnd() === ":::publisle-block") {
    const line = cursor + 1;
    expect(":::publisle-block");
    const block = fence("publisle-envelope");
    expect(":::");
    blocks.push(block);
    if (isPlainObject(block) && typeof block["id"] === "string")
      locations[block["id"]] = {
        line,
        column: 1,
        ...(sourceName === undefined ? {} : { source: sourceName }),
      };
    blank();
  }
  expect("::::");
  blank();
  if (cursor !== lines.length)
    throw new SchemaParseError(
      "invalid-archival-markdown",
      "Unexpected content after archival document.",
    );
  const raw = { ...manifest, blocks };
  const document = parseDocument(raw);
  if (canonicalizeJson(raw) !== canonicalizeJson(document))
    throw new SchemaParseError(
      "unsupported-archival-fields",
      "Archive contains unsupported envelope fields; original source must be retained.",
    );
  return {
    document,
    sourceMap: {
      document: {
        line: start + 1,
        column: 1,
        ...(sourceName === undefined ? {} : { source: sourceName }),
      },
      blocks: locations,
    },
  };
}
