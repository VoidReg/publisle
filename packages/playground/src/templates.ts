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
  /** One-line description for the block palette. */
  readonly description?: string;
  /** Palette category id; defaults to "interactive". */
  readonly category?: string;
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

export const CORE_BLOCK_DESCRIPTIONS: Record<string, string> = {
  "publisle:paragraph": "Plain paragraph with rich inline content",
  "publisle:heading": "Section heading with optional cross-reference label",
  "publisle:list": "Bulleted or numbered list of items",
  "publisle:quote": "Block quotation",
  "publisle:code": "Code sample with language hint",
  "publisle:math": "Display or inline math with a live LaTeX editor",
  "publisle:figure": "Image with alternative text and caption",
  "publisle:table": "Data table with header rows and caption",
  "publisle:bibliography": "CSL JSON bibliography entries",
  "publisle:callout": "Highlighted note, warning, or error",
  "publisle:divider": "Horizontal rule",
  "publisle:embed": "External media with a static fallback",
  "publisle:diagram": "Mermaid, Graphviz, PlantUML, or WaveDrom diagram",
  "publisle:raw-html": "Authored raw HTML passthrough",
  "publisle:interactive-schematic": "Interactive circuit schematic island",
};

/** Palette category ids in display order. */
export const CORE_BLOCK_CATEGORIES: readonly {
  readonly id: string;
  readonly label: string;
  readonly types: readonly string[];
}[] = [
  {
    id: "text",
    label: "Text",
    types: [
      "publisle:paragraph",
      "publisle:heading",
      "publisle:list",
      "publisle:quote",
      "publisle:callout",
      "publisle:code",
    ],
  },
  {
    id: "math-figures",
    label: "Math & Figures",
    types: [
      "publisle:math",
      "publisle:figure",
      "publisle:table",
      "publisle:diagram",
      "publisle:embed",
    ],
  },
  {
    id: "structure",
    label: "Structure",
    types: ["publisle:divider", "publisle:raw-html"],
  },
  {
    id: "bibliography",
    label: "Bibliography",
    types: ["publisle:bibliography"],
  },
  {
    id: "interactive",
    label: "Interactive",
    types: ["publisle:interactive-schematic"],
  },
];

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

/** Description lookup including host extensions. */
export function blockDescriptions(
  extensions?: PlaygroundExtensions,
): Record<string, string> {
  const descriptions: Record<string, string> = { ...CORE_BLOCK_DESCRIPTIONS };
  for (const block of extensions?.blocks ?? [])
    if (block.description) descriptions[block.type] = block.description;
  return descriptions;
}

/** Palette categories including host extension blocks. */
export function blockCategories(extensions?: PlaygroundExtensions): readonly {
  readonly id: string;
  readonly label: string;
  readonly types: readonly string[];
}[] {
  const categories = CORE_BLOCK_CATEGORIES.map((category) => ({
    ...category,
    types: [...category.types],
  }));
  for (const block of extensions?.blocks ?? []) {
    const id = block.category ?? "interactive";
    let category = categories.find((entry) => entry.id === id);
    if (!category) {
      category = { id, label: id, types: [] };
      categories.push(category);
    }
    (category.types as string[]).push(block.type);
  }
  return categories;
}
