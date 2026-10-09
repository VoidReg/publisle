import { defaultFourier } from "@publisle/example-fourier";
import { defaultScene } from "@publisle/example-scene";
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
  | "publisle:embed"
  | "publisle:diagram"
  | "publisle:interactive-schematic"
  | "demo:interactive-scene"
  | "demo:fourier-partial-sum";

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
  "publisle:embed",
  "publisle:diagram",
  "publisle:interactive-schematic",
  "demo:interactive-scene",
  "demo:fourier-partial-sum",
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
  "publisle:embed": "Embed",
  "publisle:diagram": "Diagram",
  "publisle:interactive-schematic": "Interactive Schematic",
  "demo:interactive-scene": "3D Scene",
  "demo:fourier-partial-sum": "Fourier partial sums",
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
    case "demo:interactive-scene":
      return defaultScene();
    case "demo:fourier-partial-sum":
      return defaultFourier();
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
  }
}
