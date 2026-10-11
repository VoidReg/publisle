import type { FlowNode, InlineNode } from "@publisle/blocks-core";
import type { FieldSpec } from "./fields.ts";

/** Core Publisle block types editable by the playground. */
export type BlockType =
  | "publisle:paragraph"
  | "publisle:heading"
  | "publisle:list"
  | "publisle:quote"
  | "publisle:code"
  | "publisle:math"
  | "publisle:figure"
  | "publisle:table"
  | "publisle:bibliography"
  | "publisle:callout"
  | "publisle:divider"
  | "publisle:embed"
  | "publisle:diagram"
  | "publisle:raw-html"
  | "publisle:interactive-schematic";

/** Host extension: one extra editable block with its label, default data, and form. */
export interface PlaygroundBlockExtension {
  readonly type: string;
  readonly label: string;
  readonly defaultData: () => unknown;
  readonly fieldSpecs?: readonly FieldSpec[];
}

/** Host extension bundle: extra block definitions and editable blocks. */
export interface PlaygroundExtensions {
  readonly definitions?: readonly unknown[];
  readonly blocks?: readonly PlaygroundBlockExtension[];
}

export const CORE_BLOCK_TYPES: readonly BlockType[] = [
  "publisle:paragraph",
  "publisle:heading",
  "publisle:list",
  "publisle:quote",
  "publisle:code",
  "publisle:math",
  "publisle:figure",
  "publisle:table",
  "publisle:bibliography",
  "publisle:callout",
  "publisle:divider",
  "publisle:embed",
  "publisle:diagram",
  "publisle:raw-html",
  "publisle:interactive-schematic",
];

export const CORE_BLOCK_LABELS: Record<string, string> = {
  "publisle:paragraph": "Paragraph",
  "publisle:heading": "Heading",
  "publisle:list": "List",
  "publisle:quote": "Quote",
  "publisle:code": "Code",
  "publisle:math": "Math",
  "publisle:figure": "Figure",
  "publisle:table": "Table",
  "publisle:bibliography": "Bibliography",
  "publisle:callout": "Callout",
  "publisle:divider": "Divider",
  "publisle:embed": "Embed",
  "publisle:diagram": "Diagram",
  "publisle:raw-html": "Raw HTML",
  "publisle:interactive-schematic": "Interactive Schematic",
};

function text(value: string): InlineNode {
  return { type: "text", value };
}

function paragraph(value: string): FlowNode {
  return { type: "paragraph", content: [text(value)] };
}

function cell(value: string): readonly InlineNode[] {
  return [text(value)];
}

/** Default block payload for a core type; extensions supply their own. */
export function coreDefaultData(type: string): unknown {
  switch (type) {
    case "publisle:paragraph":
      return { content: [text("New paragraph")] };
    case "publisle:heading":
      return { level: 2, content: [text("Heading")] };
    case "publisle:list":
      return {
        ordered: false,
        items: [
          { type: "listItem", children: [paragraph("First item")] },
          { type: "listItem", children: [paragraph("Second item")] },
        ],
      };
    case "publisle:quote":
      return { children: [paragraph("Quoted text")] };
    case "publisle:code":
      return { value: "console.log('hello');", language: "ts" };
    case "publisle:math":
      return { value: "x^2 + y^2 = z^2", display: false };
    case "publisle:figure":
      return {
        src: "",
        alt: "",
        caption: [paragraph("Figure caption")],
      };
    case "publisle:table":
      return {
        align: [null, null],
        rows: [
          [cell("Header 1"), cell("Header 2")],
          [cell("Cell 1"), cell("Cell 2")],
        ],
      };
    case "publisle:bibliography":
      return {
        entries: [
          {
            id: "example2026",
            type: "book",
            authors: ["Author, Ada"],
            title: "An Example Reference",
            issued: "2026",
            publisher: "Example Press",
          },
        ],
      };
    case "publisle:raw-html":
      return { value: "<!-- authored raw HTML -->" };
    case "publisle:callout":
      return {
        variant: "info",
        title: "Note",
        children: [paragraph("Callout content")],
      };
    case "publisle:divider":
      return {};
    case "publisle:embed":
      return {
        provider: "youtube",
        resourceId: "dQw4w9WgXcQ",
        title: "Embedded video",
        aspectRatio: { width: 16, height: 9 },
        fallback: [paragraph("Open the video on its provider.")],
      };
    case "publisle:diagram":
      return {
        engine: "mermaid",
        source: "graph TD\n  A --> B",
        alt: "A points to B",
        fallback: [paragraph("A points to B.")],
      };
    case "publisle:interactive-schematic":
      return {
        activation: "interaction",
        content: {
          title: [text("Clocked counter")],
          description: [paragraph("Observe the output on each clock edge.")],
          instructions: [
            paragraph(
              "Select Clock to advance it. Select Reset to return to zero.",
            ),
          ],
        },
        fallback: [paragraph("The counter starts at zero.")],
        accessibility: { label: "Interactive clocked counter" },
        payload: { source: "./counter.json" },
      };
    default:
      return {};
  }
}

/** Editable type list including host extensions, in insertion order. */
export function blockTypes(
  extensions?: PlaygroundExtensions,
): readonly string[] {
  return [
    ...CORE_BLOCK_TYPES,
    ...(extensions?.blocks?.map((block) => block.type) ?? []),
  ];
}

/** Label lookup including host extensions. */
export function blockLabels(
  extensions?: PlaygroundExtensions,
): Record<string, string> {
  const labels: Record<string, string> = { ...CORE_BLOCK_LABELS };
  for (const block of extensions?.blocks ?? [])
    labels[block.type] = block.label;
  return labels;
}

/** Default payload for any type; extensions resolve before the core fallback. */
export function defaultData(
  type: string,
  extensions?: PlaygroundExtensions,
): unknown {
  const extension = extensions?.blocks?.find((block) => block.type === type);
  if (extension) return extension.defaultData();
  return coreDefaultData(type);
}
