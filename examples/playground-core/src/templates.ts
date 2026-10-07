import type { FlowNode, InlineNode } from "@publisle/blocks-core";

export type BlockType =
  | "publisle:paragraph"
  | "publisle:heading"
  | "publisle:list"
  | "publisle:quote"
  | "publisle:code"
  | "publisle:math"
  | "publisle:figure"
  | "publisle:table"
  | "publisle:callout"
  | "publisle:divider"
  | "publisle:interactive-schematic";

export const BLOCK_TYPES: BlockType[] = [
  "publisle:paragraph",
  "publisle:heading",
  "publisle:list",
  "publisle:quote",
  "publisle:code",
  "publisle:math",
  "publisle:figure",
  "publisle:table",
  "publisle:callout",
  "publisle:divider",
  "publisle:interactive-schematic",
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  "publisle:paragraph": "Paragraph",
  "publisle:heading": "Heading",
  "publisle:list": "List",
  "publisle:quote": "Quote",
  "publisle:code": "Code",
  "publisle:math": "Math",
  "publisle:figure": "Figure",
  "publisle:table": "Table",
  "publisle:callout": "Callout",
  "publisle:divider": "Divider",
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

export function defaultData(type: BlockType): unknown {
  switch (type) {
    case "publisle:paragraph":
      return { content: [text("New paragraph")] };
    case "publisle:heading":
      return { level: 2, content: [text("Heading")] };
    case "publisle:list":
      return {
        ordered: false,
        items: [
          { children: [paragraph("First item")] },
          { children: [paragraph("Second item")] },
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
        caption: [text("Figure caption")],
      };
    case "publisle:table":
      return {
        align: [null, null],
        rows: [
          [cell("Header 1"), cell("Header 2")],
          [cell("Cell 1"), cell("Cell 2")],
        ],
      };
    case "publisle:callout":
      return {
        variant: "info",
        title: "Note",
        children: [paragraph("Callout content")],
      };
    case "publisle:divider":
      return {};
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
  }
}
