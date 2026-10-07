import { definePortableBlock } from "@publisle/block-sdk";
import { SchemaParseError } from "@publisle/schema";
import { flowNodes, inlineNodes, listItems, record, string } from "./parse.ts";
import type {
  CalloutData,
  CodeData,
  FigureData,
  FootnoteData,
  HeadingData,
  ListData,
  MathData,
  ParagraphData,
  QuoteData,
  RawHtmlData,
  TableData,
} from "./types.ts";

function booleanValue(
  value: unknown,
  label: string,
  whenAbsent: boolean,
): boolean {
  if (value === undefined) return whenAbsent;
  if (typeof value !== "boolean")
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be a boolean.`,
    );
  return value;
}

export const paragraphDefinition = definePortableBlock({
  type: "publisle:paragraph",
  schemaVersion: 1,
  schema: {
    parse(value): ParagraphData {
      const data = record(value, "paragraph");
      return { content: inlineNodes(data["content"]) };
    },
  },
});
export const headingDefinition = definePortableBlock({
  type: "publisle:heading",
  schemaVersion: 1,
  schema: {
    parse(value): HeadingData {
      const data = record(value, "heading");
      const level = Number(data["level"]);
      if (![1, 2, 3, 4, 5, 6].includes(level))
        throw new SchemaParseError(
          "invalid-block-data",
          "heading.level must be between 1 and 6.",
        );
      return {
        level: level as HeadingData["level"],
        content: inlineNodes(data["content"]),
      };
    },
  },
});
export const listDefinition = definePortableBlock({
  type: "publisle:list",
  schemaVersion: 1,
  schema: {
    parse(value): ListData {
      const data = record(value, "list");
      if (!Array.isArray(data["items"]))
        throw new SchemaParseError(
          "invalid-block-data",
          "list.items must be an array.",
        );
      return {
        ordered: booleanValue(data["ordered"], "list.ordered", false),
        ...(typeof data["start"] === "number" ? { start: data["start"] } : {}),
        items: listItems(data["items"], "list.items"),
      };
    },
  },
});
export const quoteDefinition = definePortableBlock({
  type: "publisle:quote",
  schemaVersion: 1,
  schema: {
    parse(value): QuoteData {
      return { children: flowNodes(record(value, "quote")["children"]) };
    },
  },
});
export const codeDefinition = definePortableBlock({
  type: "publisle:code",
  schemaVersion: 1,
  schema: {
    parse(value): CodeData {
      const data = record(value, "code");
      return {
        value: string(data["value"], "code.value"),
        ...(typeof data["language"] === "string"
          ? { language: data["language"] }
          : {}),
        ...(typeof data["meta"] === "string" ? { meta: data["meta"] } : {}),
      };
    },
  },
});
export const mathDefinition = definePortableBlock({
  type: "publisle:math",
  schemaVersion: 1,
  schema: {
    parse(value): MathData {
      const data = record(value, "math");
      return {
        value: string(data["value"], "math.value"),
        display: booleanValue(data["display"], "math.display", false),
      };
    },
  },
});
export const figureDefinition = definePortableBlock({
  type: "publisle:figure",
  schemaVersion: 1,
  schema: {
    parse(value): FigureData {
      const data = record(value, "figure");
      if (data["alt"] === undefined)
        throw new SchemaParseError(
          "invalid-block-data",
          "figure.alt is required.",
        );
      return {
        src: string(data["src"], "figure.src"),
        alt: string(data["alt"], "figure.alt"),
        ...(typeof data["title"] === "string" ? { title: data["title"] } : {}),
        ...(data["caption"] === undefined
          ? {}
          : { caption: inlineNodes(data["caption"], "figure.caption") }),
      };
    },
  },
  resources: (data) => [{ uri: data.src }],
});
export const tableDefinition = definePortableBlock({
  type: "publisle:table",
  schemaVersion: 1,
  schema: {
    parse(value): TableData {
      const data = record(value, "table");
      if (!Array.isArray(data["rows"]) || !Array.isArray(data["align"]))
        throw new SchemaParseError(
          "invalid-block-data",
          "table rows and align must be arrays.",
        );
      const alignValues = data["align"] as unknown[];
      const rows = data["rows"] as unknown[];
      const align = alignValues.map((entry, index) => {
        if (
          entry === "left" ||
          entry === "right" ||
          entry === "center" ||
          entry === null
        )
          return entry;
        throw new SchemaParseError(
          "invalid-block-data",
          `table.align[${index}] must be left, right, center, or null.`,
        );
      });
      return {
        align,
        rows: rows.map((row, rowIndex) => {
          if (!Array.isArray(row))
            throw new SchemaParseError(
              "invalid-block-data",
              `table.rows[${rowIndex}] must be an array.`,
            );
          const cells = row as unknown[];
          return cells.map((cell, cellIndex) =>
            inlineNodes(cell, `table.rows[${rowIndex}][${cellIndex}]`),
          );
        }),
      };
    },
  },
});
export const calloutDefinition = definePortableBlock({
  type: "publisle:callout",
  schemaVersion: 1,
  schema: {
    parse(value): CalloutData {
      const data = record(value, "callout");
      return {
        variant: string(data["variant"] ?? "note", "callout.variant"),
        ...(typeof data["title"] === "string" ? { title: data["title"] } : {}),
        children: flowNodes(data["children"]),
      };
    },
  },
});
export const dividerDefinition = definePortableBlock({
  type: "publisle:divider",
  schemaVersion: 1,
  schema: {
    parse(value): Record<string, never> {
      record(value, "divider");
      return {};
    },
  },
});
export const footnoteDefinition = definePortableBlock({
  type: "publisle:footnote",
  schemaVersion: 1,
  schema: {
    parse(value): FootnoteData {
      const data = record(value, "footnote");
      return {
        identifier: string(data["identifier"], "footnote.identifier"),
        children: flowNodes(data["children"]),
      };
    },
  },
});
export const rawHtmlDefinition = definePortableBlock({
  type: "publisle:raw-html",
  schemaVersion: 1,
  schema: {
    parse(value): RawHtmlData {
      const data = record(value, "raw-html");
      return {
        value: string(data["value"], "raw-html.value"),
        inline: data["inline"] === true,
      };
    },
  },
});

export const coreBlockDefinitions = [
  paragraphDefinition,
  headingDefinition,
  listDefinition,
  quoteDefinition,
  codeDefinition,
  mathDefinition,
  figureDefinition,
  tableDefinition,
  calloutDefinition,
  dividerDefinition,
  footnoteDefinition,
  rawHtmlDefinition,
] as const;
