import type { PhrasingContent, Root, RootContent } from "mdast";
import { directiveToMarkdown } from "mdast-util-directive";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { gfmToMarkdown } from "mdast-util-gfm";
import { mathToMarkdown } from "mdast-util-math";
import { toMarkdown as serialize } from "mdast-util-to-markdown";
import YAML from "yaml";
import {
  isInteractiveEnvelope,
  type Block,
  type Diagnostic,
  type Document,
} from "@publisle/schema";
import type { FlowNode, InlineNode, ListItemData } from "@publisle/blocks-core";
import type { MarkdownExportOptions, MarkdownExportResult } from "./types.ts";

type GenericNode = { type: string; [key: string]: unknown };

function phrasing(nodes: readonly InlineNode[]): PhrasingContent[] {
  return nodes.map((node): PhrasingContent => {
    switch (node.type) {
      case "text":
        return { type: "text", value: node.value };
      case "emphasis":
      case "strong":
      case "delete":
        return {
          type: node.type,
          children: phrasing(node.children),
        } as PhrasingContent;
      case "inlineCode":
        return { type: "inlineCode", value: node.value };
      case "math":
        return { type: "inlineMath", value: node.value } as PhrasingContent;
      case "link":
        return {
          type: "link",
          url: node.url,
          ...(node.title === undefined ? {} : { title: node.title }),
          children: phrasing(node.children),
        };
      case "image":
        return {
          type: "image",
          url: node.url,
          alt: node.alt,
          ...(node.title === undefined ? {} : { title: node.title }),
        };
      case "break":
        return { type: "break" };
      case "footnoteReference":
        return {
          type: "footnoteReference",
          identifier: node.identifier,
          label: node.identifier,
        } as PhrasingContent;
      case "rawHtml":
        return { type: "html", value: node.value };
    }
  });
}

function flow(nodes: readonly FlowNode[]): RootContent[] {
  return nodes.map((node): RootContent => {
    switch (node.type) {
      case "paragraph":
        return { type: "paragraph", children: phrasing(node.content) };
      case "heading":
        return {
          type: "heading",
          depth: node.level as 1 | 2 | 3 | 4 | 5 | 6,
          children: phrasing(node.content),
        };
      case "quote":
        return { type: "blockquote", children: flow(node.children) as never };
      case "list":
        return {
          type: "list",
          ordered: node.ordered,
          ...(node.start === undefined ? {} : { start: node.start }),
          spread: false,
          children: node.items.map((item) => ({
            type: "listItem",
            spread: false,
            ...(item.checked === undefined ? {} : { checked: item.checked }),
            children: flow(item.children) as never,
          })),
        };
      case "code":
        return {
          type: "code",
          value: node.value,
          ...(node.language === undefined ? {} : { lang: node.language }),
          ...(node.meta === undefined ? {} : { meta: node.meta }),
        };
      case "divider":
        return { type: "thematicBreak" };
      case "rawHtml":
        return { type: "html", value: node.value };
    }
  });
}

function data<T>(block: Block): T {
  return block.data as T;
}

function directiveSlot(
  name: string,
  children: readonly RootContent[],
): GenericNode {
  return { type: "containerDirective", name, children };
}

function interactiveDirective(block: Block): GenericNode | undefined {
  if (!isInteractiveEnvelope(block.data)) return undefined;
  const value = block.data;
  const slots: GenericNode[] = [];
  if (value.content?.title?.length) {
    slots.push(
      directiveSlot("title", [
        {
          type: "paragraph",
          children: phrasing(value.content.title as readonly InlineNode[]),
        },
      ]),
    );
  }
  if (value.content?.description?.length)
    slots.push(
      directiveSlot(
        "description",
        flow(value.content.description as readonly FlowNode[]),
      ),
    );
  if (value.content?.instructions?.length)
    slots.push(
      directiveSlot(
        "instructions",
        flow(value.content.instructions as readonly FlowNode[]),
      ),
    );
  if (value.fallback?.length)
    slots.push(
      directiveSlot("fallback", flow(value.fallback as readonly FlowNode[])),
    );
  slots.push({
    type: "code",
    lang: "publisle-payload",
    value: JSON.stringify(value.payload, null, 2),
  });
  return {
    type: "containerDirective",
    name: "interactive",
    attributes: {
      type: block.type,
      schemaVersion: String(block.schemaVersion),
      id: block.id,
      activation: value.activation,
      ...(value.accessibility?.label === undefined
        ? {}
        : { label: value.accessibility.label }),
    },
    children: slots,
  };
}

function standardInteractive(block: Block): RootContent[] {
  if (!isInteractiveEnvelope(block.data)) return [];
  const value = block.data;
  const nodes: RootContent[] = [];
  if (value.content?.title?.length)
    nodes.push({
      type: "paragraph",
      children: phrasing(value.content.title as readonly InlineNode[]),
    });
  if (value.content?.description?.length)
    nodes.push(...flow(value.content.description as readonly FlowNode[]));
  if (value.content?.instructions?.length)
    nodes.push(...flow(value.content.instructions as readonly FlowNode[]));
  if (value.fallback?.length)
    nodes.push(...flow(value.fallback as readonly FlowNode[]));
  return nodes;
}

function knownBlock(block: Block): RootContent | GenericNode | undefined {
  const interactive = interactiveDirective(block);
  if (interactive) return interactive;
  switch (block.type) {
    case "publisle:paragraph":
      return {
        type: "paragraph",
        children: phrasing(
          data<{ content: readonly InlineNode[] }>(block).content,
        ),
      };
    case "publisle:heading": {
      const value = data<{ level: number; content: readonly InlineNode[] }>(
        block,
      );
      return {
        type: "heading",
        depth: value.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: phrasing(value.content),
      };
    }
    case "publisle:list": {
      const value = data<{
        ordered: boolean;
        start?: number;
        items: readonly ListItemData[];
      }>(block);
      return {
        type: "list",
        ordered: value.ordered,
        ...(value.start === undefined ? {} : { start: value.start }),
        spread: false,
        children: value.items.map((item) => ({
          type: "listItem",
          spread: false,
          ...(item.checked === undefined ? {} : { checked: item.checked }),
          children: flow(item.children),
        })),
      };
    }
    case "publisle:quote":
      return {
        type: "blockquote",
        children: flow(data<{ children: readonly FlowNode[] }>(block).children),
      };
    case "publisle:code": {
      const value = data<{ value: string; language?: string; meta?: string }>(
        block,
      );
      return {
        type: "code",
        value: value.value,
        ...(value.language === undefined ? {} : { lang: value.language }),
        ...(value.meta === undefined ? {} : { meta: value.meta }),
      };
    }
    case "publisle:math":
      return { type: "math", value: data<{ value: string }>(block).value };
    case "publisle:divider":
      return { type: "thematicBreak" };
    case "publisle:figure": {
      const value = data<{
        src: string;
        alt: string;
        title?: string;
        caption?: readonly InlineNode[];
      }>(block);
      if (!value.caption)
        return {
          type: "paragraph",
          children: [
            {
              type: "image",
              url: value.src,
              alt: value.alt,
              ...(value.title === undefined ? {} : { title: value.title }),
            },
          ],
        };
      return {
        type: "containerDirective",
        name: "figure",
        attributes: {
          src: value.src,
          alt: value.alt,
          ...(value.title === undefined ? {} : { title: value.title }),
        },
        children: [{ type: "paragraph", children: phrasing(value.caption) }],
      };
    }
    case "publisle:table": {
      const value = data<{
        align: readonly ("left" | "right" | "center" | null)[];
        rows: readonly (readonly (readonly InlineNode[])[])[];
      }>(block);
      return {
        type: "table",
        align: [...value.align],
        children: value.rows.map((row) => ({
          type: "tableRow",
          children: row.map((cell) => ({
            type: "tableCell",
            children: phrasing(cell),
          })),
        })),
      };
    }
    case "publisle:callout": {
      const value = data<{
        variant: string;
        title?: string;
        children: readonly FlowNode[];
      }>(block);
      return {
        type: "containerDirective",
        name: "callout",
        attributes: {
          variant: value.variant,
          ...(value.title === undefined ? {} : { title: value.title }),
        },
        children: flow(value.children),
      };
    }
    case "publisle:footnote": {
      const value = data<{ identifier: string; children: readonly FlowNode[] }>(
        block,
      );
      return {
        type: "footnoteDefinition",
        identifier: value.identifier,
        label: value.identifier,
        children: flow(value.children),
      };
    }
    case "publisle:raw-html":
      return { type: "html", value: data<{ value: string }>(block).value };
    default:
      return undefined;
  }
}

function generic(block: Block): GenericNode {
  return {
    type: "containerDirective",
    name: "publisle",
    attributes: {
      type: block.type,
      schemaVersion: String(block.schemaVersion),
      id: block.id,
    },
    children: [
      {
        type: "code",
        lang: "json",
        value: JSON.stringify(block.data, null, 2),
      },
    ],
  };
}

function frontmatter(document: Document): GenericNode | undefined {
  if (!document.metadata) return undefined;
  const { extensions, ...known } = document.metadata;
  const value: Record<string, unknown> = { ...(extensions ?? {}), ...known };
  return { type: "yaml", value: YAML.stringify(value).trimEnd() };
}

export function toMarkdown(
  document: Document,
  options: MarkdownExportOptions = {},
): MarkdownExportResult {
  const diagnostics: Diagnostic[] = [];
  const policy = options.policy ?? "fallback";
  const nodes: (RootContent | GenericNode)[] = [];
  const metadata = frontmatter(document);
  if (metadata) nodes.push(metadata);
  for (const block of document.blocks) {
    if (policy === "standard" && isInteractiveEnvelope(block.data)) {
      diagnostics.push({
        level: "warning",
        code: "interactive-behavior-lost",
        message: `Interactive behavior for ${block.type} is omitted from standard Markdown.`,
        blockId: block.id,
      });
      nodes.push(...standardInteractive(block));
      continue;
    }
    const converted = knownBlock(block);
    if (converted) {
      nodes.push(converted);
      continue;
    }
    diagnostics.push({
      level: policy === "strict" ? "error" : "warning",
      code: "unsupported-markdown-block",
      message: `No native Markdown codec is registered for ${block.type}.`,
      blockId: block.id,
    });
    if (policy !== "warn") nodes.push(generic(block));
  }
  if (diagnostics.some(({ level }) => level === "error"))
    return { diagnostics };
  const markdown = serialize({ type: "root", children: nodes } as Root, {
    extensions: [
      gfmToMarkdown(),
      directiveToMarkdown(),
      frontmatterToMarkdown(["yaml"]),
      mathToMarkdown(),
    ],
  });
  return { markdown, diagnostics };
}
