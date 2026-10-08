import type { PhrasingContent, Root, RootContent } from "mdast";
import { directiveToMarkdown } from "mdast-util-directive";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { gfmToMarkdown } from "mdast-util-gfm";
import { mathToMarkdown } from "mdast-util-math";
import { toMarkdown as serialize } from "mdast-util-to-markdown";
import YAML from "yaml";
import {
  isInteractiveEnvelope,
  isPlainObject,
  type Block,
  type BlockType,
  type Diagnostic,
  type Document,
} from "@publisle/schema";
import type { FlowNode, InlineNode, ListItemData } from "@publisle/blocks-core";
import type { MarkdownExportOptions, MarkdownExportResult } from "./types.ts";
import { codecRegistry } from "./codecs.ts";
import { toArchivalMarkdown } from "./archive.ts";

function serializeTree(tree: Root): string {
  return serialize(tree, {
    extensions: [
      gfmToMarkdown(),
      directiveToMarkdown(),
      frontmatterToMarkdown(["yaml"]),
      mathToMarkdown(),
    ],
  });
}

function hasDirective(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return (
    ["containerDirective", "leafDirective", "textDirective"].includes(
      String(value["type"]),
    ) ||
    (Array.isArray(value["children"]) && value["children"].some(hasDirective))
  );
}

type GenericNode = { type: string; [key: string]: unknown };
type AnyBlock = Block<BlockType, unknown>;

function phrasing(
  nodes: readonly InlineNode[],
  standard = false,
): PhrasingContent[] {
  return nodes.map((node): PhrasingContent => {
    switch (node.type) {
      case "text":
        return { type: "text", value: node.value };
      case "emphasis":
      case "strong":
      case "strikethrough":
        return {
          type: node.type === "strikethrough" ? "delete" : node.type,
          children: phrasing(node.children, standard),
        } as PhrasingContent;
      case "inlineCode":
        return { type: "inlineCode", value: node.value };
      case "inlineMath":
        return { type: "inlineMath", value: node.value } as PhrasingContent;
      case "link":
        return {
          type: "link",
          url: node.url,
          ...(node.title === undefined ? {} : { title: node.title }),
          children: phrasing(node.children, standard),
        };
      case "inlineImage":
        return {
          type: "image",
          url: node.url,
          alt: node.alt,
          ...(node.title === undefined ? {} : { title: node.title }),
        };
      case "hardBreak":
        return { type: "break" };
      case "softBreak":
        return { type: "text", value: "\n" };
      case "footnoteReference":
        return {
          type: "footnoteReference",
          identifier: node.identifier,
          label: node.identifier,
        } as PhrasingContent;
      case "citationReference": {
        if (standard)
          return {
            type: "text",
            value: `[${node.prefix ?? ""}${node.items.map(({ id, locator }) => `${id}${locator ? `, ${locator}` : ""}`).join("; ")}${node.suffix ?? ""}]`,
          };
        const simple = node.items.length === 1 ? node.items[0] : undefined;
        return {
          type: "textDirective",
          name: "cite",
          attributes: {
            ...(simple?.locator === undefined
              ? {}
              : { locator: simple.locator }),
            ...(simple?.label === undefined ? {} : { label: simple.label }),
            ...(simple?.suppressAuthor === true
              ? { suppressAuthor: "true" }
              : {}),
            ...(node.prefix === undefined ? {} : { prefix: node.prefix }),
            ...(node.suffix === undefined ? {} : { suffix: node.suffix }),
            ...(simple === undefined
              ? { data: encodeURIComponent(JSON.stringify(node.items)) }
              : {}),
          },
          children: [
            { type: "text", value: node.items.map(({ id }) => id).join("; ") },
          ],
        } as unknown as PhrasingContent;
      }
      case "crossReference":
        if (standard)
          return node.children
            ? ({
                type: "text",
                value: node.children
                  .map((child) => (child.type === "text" ? child.value : ""))
                  .join(""),
              } as PhrasingContent)
            : { type: "text", value: node.target };
        return {
          type: "textDirective",
          name: "ref",
          ...(node.children
            ? {
                attributes: { target: node.target },
                children: phrasing(node.children),
              }
            : { children: [{ type: "text", value: node.target }] }),
        } as unknown as PhrasingContent;
      case "rawHtml":
        return { type: "html", value: node.value };
    }
  });
}

function flow(nodes: readonly FlowNode[], standard = false): RootContent[] {
  return nodes.map((node): RootContent => {
    switch (node.type) {
      case "paragraph":
        return {
          type: "paragraph",
          children: phrasing(node.content, standard),
        };
      case "heading":
        return {
          type: "heading",
          depth: node.level as 1 | 2 | 3 | 4 | 5 | 6,
          children: phrasing(node.content, standard),
        };
      case "quote":
        return {
          type: "blockquote",
          children: flow(node.children, standard) as never,
        };
      case "list":
        return {
          type: "list",
          ordered: node.ordered,
          ...(node.start === undefined ? {} : { start: node.start }),
          spread: false,
          children: node.items.map((item) => ({
            type: "listItem",
            spread: false,
            ...(item.type === "taskListItem" ? { checked: item.checked } : {}),
            children: flow(item.children, standard) as never,
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

function data<T>(block: AnyBlock): T {
  return block.data as T;
}

function directiveSlot(
  name: string,
  children: readonly RootContent[],
): GenericNode {
  return { type: "containerDirective", name, children };
}

function interactiveDirective(
  block: AnyBlock,
  payloadFormatting: MarkdownExportOptions["payloadFormatting"],
): GenericNode | undefined {
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
  for (const key of [
    "purpose",
    "observations",
    "assumptions",
    "fallback",
  ] as const) {
    const content = value.content?.[key];
    if (content?.length)
      slots.push(
        directiveSlot(
          key === "fallback" ? "content-fallback" : key,
          flow(content as readonly FlowNode[]),
        ),
      );
  }
  if (value.content?.presets)
    slots.push({
      type: "code",
      lang: "publisle-presets",
      value: JSON.stringify(
        value.content.presets,
        null,
        payloadFormatting === "compact" ? undefined : 2,
      ),
    });
  slots.push({
    type: "code",
    lang: "publisle-payload",
    value: JSON.stringify(
      value.payload,
      null,
      payloadFormatting === "compact" ? undefined : 2,
    ),
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

function standardInteractive(block: AnyBlock): RootContent[] {
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
  for (const key of [
    "purpose",
    "observations",
    "assumptions",
    "fallback",
  ] as const) {
    const content = value.content?.[key];
    if (content?.length) nodes.push(...flow(content as readonly FlowNode[]));
  }
  for (const preset of value.content?.presets ?? [])
    if (preset.description?.length)
      nodes.push(...flow(preset.description as readonly FlowNode[]));
  return nodes;
}

function standardExtension(block: AnyBlock): RootContent[] | undefined {
  const value = block.data as Record<string, unknown>;
  if (block.type === "publisle:figure") {
    const image: RootContent = {
      type: "paragraph",
      children: [
        {
          type: "image",
          url: String(value["src"] ?? ""),
          alt: String(value["alt"] ?? "Figure description missing."),
          ...(typeof value["title"] === "string"
            ? { title: value["title"] }
            : {}),
        },
      ],
    };
    return [
      image,
      ...(Array.isArray(value["caption"])
        ? flow(value["caption"] as FlowNode[], true)
        : []),
    ];
  }
  if (block.type === "publisle:embed")
    return [
      ...(Array.isArray(value["caption"])
        ? flow(value["caption"] as FlowNode[], true)
        : []),
      ...(Array.isArray(value["fallback"])
        ? flow(value["fallback"] as FlowNode[], true)
        : []),
    ];
  if (block.type === "publisle:diagram") {
    const print = value["printFallback"] as Record<string, unknown> | undefined;
    return [
      ...(print && typeof print["src"] === "string"
        ? [
            {
              type: "paragraph" as const,
              children: [
                {
                  type: "image" as const,
                  url: print["src"],
                  alt: String(value["alt"] ?? ""),
                },
              ],
            },
          ]
        : [
            {
              type: "code" as const,
              lang: String(value["engine"] ?? ""),
              value: String(value["source"] ?? ""),
            },
          ]),
      ...(Array.isArray(value["caption"])
        ? flow(value["caption"] as FlowNode[], true)
        : []),
      ...(Array.isArray(value["fallback"])
        ? flow(value["fallback"] as FlowNode[], true)
        : []),
    ];
  }
  return undefined;
}

function knownBlock(
  block: AnyBlock,
  standard = false,
  payloadFormatting?: MarkdownExportOptions["payloadFormatting"],
): RootContent | GenericNode | undefined {
  const interactive = interactiveDirective(block, payloadFormatting);
  if (interactive) return interactive;
  switch (block.type) {
    case "publisle:paragraph":
      return {
        type: "paragraph",
        children: phrasing(
          data<{ content: readonly InlineNode[] }>(block).content,
          standard,
        ),
      };
    case "publisle:heading": {
      const value = data<{
        level: number;
        content: readonly InlineNode[];
        label?: string;
      }>(block);
      const headingNode: GenericNode = {
        type: "heading",
        depth: value.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: phrasing(value.content, standard),
      };
      return value.label && !standard
        ? {
            type: "containerDirective",
            name: "heading",
            attributes: { label: value.label },
            children: [headingNode],
          }
        : headingNode;
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
          ...(item.type === "taskListItem" ? { checked: item.checked } : {}),
          children: flow(item.children, standard),
        })),
      };
    }
    case "publisle:quote":
      return {
        type: "blockquote",
        children: flow(
          data<{ children: readonly FlowNode[] }>(block).children,
          standard,
        ),
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
    case "publisle:math": {
      const value = data<{ value: string; label?: string }>(block);
      const mathNode: GenericNode = { type: "math", value: value.value };
      return value.label && !standard
        ? {
            type: "containerDirective",
            name: "equation",
            attributes: { label: value.label },
            children: [mathNode],
          }
        : mathNode;
    }
    case "publisle:divider":
      return { type: "thematicBreak" };
    case "publisle:figure": {
      const value = data<{
        src: string;
        alt?: string;
        title?: string;
        label?: string;
        caption?: readonly FlowNode[];
        credit?: readonly InlineNode[];
        original?: { src: string; mediaType?: string; filename?: string };
      }>(block);
      if (
        value.alt !== undefined &&
        !value.caption &&
        !value.credit &&
        !value.label &&
        !value.original
      )
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
          ...(value.alt === undefined ? {} : { alt: value.alt }),
          ...(value.title === undefined ? {} : { title: value.title }),
          ...(value.label === undefined ? {} : { label: value.label }),
          ...(value.original === undefined
            ? {}
            : { original: value.original.src }),
          ...(value.original?.mediaType === undefined
            ? {}
            : { mediaType: value.original.mediaType }),
          ...(value.original?.filename === undefined
            ? {}
            : { filename: value.original.filename }),
        },
        children: [
          ...(value.caption
            ? [directiveSlot("caption", flow(value.caption))]
            : []),
          ...(value.credit
            ? [
                directiveSlot("credit", [
                  { type: "paragraph", children: phrasing(value.credit) },
                ]),
              ]
            : []),
        ],
      };
    }
    case "publisle:table": {
      const value = data<{
        align: readonly ("left" | "right" | "center" | null)[];
        rows: readonly (readonly (readonly InlineNode[])[])[];
        label?: string;
        caption?: readonly FlowNode[];
      }>(block);
      const tableNode: GenericNode = {
        type: "table",
        align: [...value.align],
        children: value.rows.map((row) => ({
          type: "tableRow",
          children: row.map((cell) => ({
            type: "tableCell",
            children: phrasing(cell, standard),
          })),
        })),
      };
      return (value.label || value.caption) && !standard
        ? {
            type: "containerDirective",
            name: "table",
            attributes: value.label ? { label: value.label } : {},
            children: [
              tableNode,
              ...(value.caption
                ? [directiveSlot("caption", flow(value.caption))]
                : []),
            ],
          }
        : tableNode;
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
        children: flow(value.children, standard),
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
        children: flow(value.children, standard),
      };
    }
    case "publisle:raw-html":
      return { type: "html", value: data<{ value: string }>(block).value };
    case "publisle:embed": {
      const value = data<{
        provider: string;
        resourceId: string;
        title: string;
        aspectRatio: { width: number; height: number };
        caption?: readonly FlowNode[];
        fallback?: readonly FlowNode[];
      }>(block);
      return {
        type: "containerDirective",
        name: "embed",
        attributes: {
          provider: value.provider,
          resource: value.resourceId,
          title: value.title,
          ratio: `${value.aspectRatio.width}/${value.aspectRatio.height}`,
        },
        children: [
          ...(value.caption
            ? [directiveSlot("caption", flow(value.caption))]
            : []),
          ...(value.fallback
            ? [directiveSlot("fallback", flow(value.fallback))]
            : []),
        ],
      };
    }
    case "publisle:diagram": {
      const value = data<{
        engine: string;
        source: string;
        alt: string;
        label?: string;
        caption?: readonly FlowNode[];
        fallback?: readonly FlowNode[];
        printFallback?: { src: string; mediaType?: string; filename?: string };
      }>(block);
      return {
        type: "containerDirective",
        name: "diagram",
        attributes: {
          engine: value.engine,
          alt: value.alt,
          ...(value.label ? { label: value.label } : {}),
          ...(value.printFallback ? { print: value.printFallback.src } : {}),
        },
        children: [
          { type: "code", lang: value.engine, value: value.source },
          ...(value.caption
            ? [directiveSlot("caption", flow(value.caption))]
            : []),
          ...(value.fallback
            ? [directiveSlot("fallback", flow(value.fallback))]
            : []),
        ],
      };
    }
    default:
      return undefined;
  }
}

function generic(block: AnyBlock): GenericNode {
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

function frontmatter(
  document: Document<Block<BlockType, unknown>>,
): GenericNode | undefined {
  if (!document.metadata) return undefined;
  const { extensions, ...known } = document.metadata;
  const value: Record<string, unknown> = { ...(extensions ?? {}), ...known };
  return { type: "yaml", value: YAML.stringify(value).trimEnd() };
}

export function toMarkdown(
  document: Document<Block<BlockType, unknown>>,
  options: MarkdownExportOptions = {},
): MarkdownExportResult {
  const diagnostics: Diagnostic[] = [];
  const policy = options.policy ?? "fallback";
  if (policy === "archival") {
    try {
      return {
        markdown: toArchivalMarkdown(document as Document),
        diagnostics,
      };
    } catch (error) {
      return {
        diagnostics: [
          {
            level: "error",
            code: "archival-export-failed",
            message:
              error instanceof Error
                ? error.message
                : "Archival export failed.",
          },
        ],
      };
    }
  }
  if (document.dependencies !== undefined || document.extensions !== undefined)
    diagnostics.push({
      level: "warning",
      code: "document-envelope-not-exported",
      message:
        "This Markdown projection does not preserve dependency pins/extensions. Use archival policy for lossless exchange.",
    });
  let codecs: ReturnType<typeof codecRegistry>;
  try {
    codecs = codecRegistry(options.codecs);
  } catch (error) {
    return {
      diagnostics: [
        {
          level: "error",
          code: "invalid-markdown-codecs",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  const nodes: (RootContent | GenericNode)[] = [];
  const metadata = frontmatter(document);
  if (metadata) nodes.push(metadata);
  for (const block of document.blocks) {
    if (block.readable)
      diagnostics.push({
        level: "warning",
        code: "readable-representation-not-exported",
        message:
          "This Markdown policy does not retain the block's digest-associated readable sidecar. Preserve the source JSON; archival envelope export is not yet supported.",
        blockId: block.id,
      });
    const codec = codecs.byType.get(block.type);
    if (codec) {
      let converted: RootContent | undefined;
      let failed = false;
      try {
        // The codec cannot mutate the caller's source article.
        converted = codec.encode(structuredClone(block), {
          ...options,
          policy,
        });
        if (converted !== undefined) {
          if (policy !== "standard") {
            if (
              converted.type !== "containerDirective" ||
              converted.name !== codec.directive
            )
              throw new Error(
                "Native codecs must return their registered container directive.",
              );
            converted = {
              ...converted,
              attributes: {
                ...converted.attributes,
                schemaVersion: String(block.schemaVersion),
              },
            };
          } else if (hasDirective(converted)) {
            throw new Error(
              "Standard codec output must not contain extension directives.",
            );
          }
          // Surface serialization failures as per-block codec diagnostics before assembling output.
          serializeTree({ type: "root", children: [converted] });
        }
      } catch (error) {
        failed = true;
        diagnostics.push({
          level: policy === "strict" ? "error" : "warning",
          code: "markdown-codec-failed",
          message: `Encoding ${block.type} failed: ${error instanceof Error ? error.message : String(error)}`,
          blockId: block.id,
        });
      }
      if (converted !== undefined && !failed) {
        if (policy === "standard")
          diagnostics.push({
            level: "warning",
            code: "extension-semantics-lost",
            message: `Publisle semantics for ${block.type} are omitted from standard Markdown.`,
            blockId: block.id,
          });
        nodes.push(converted);
      } else {
        if (!failed)
          diagnostics.push({
            level: policy === "strict" ? "error" : "warning",
            code: "unsupported-markdown-block",
            message: `Codec ${codec.directive} cannot encode ${block.type} at schema version ${block.schemaVersion} under ${policy}.`,
            blockId: block.id,
          });
        nodes.push(generic(block));
      }
      continue;
    }
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
    if (policy === "standard") {
      const standard = standardExtension(block);
      if (standard) {
        diagnostics.push({
          level: "warning",
          code: "extension-semantics-lost",
          message: `Publisle semantics for ${block.type} are omitted from standard Markdown.`,
          blockId: block.id,
        });
        nodes.push(...standard);
        continue;
      }
    }
    const converted = knownBlock(
      block,
      policy === "standard",
      options.payloadFormatting,
    );
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
    nodes.push(generic(block));
  }
  if (diagnostics.some(({ level }) => level === "error"))
    return { diagnostics };
  const markdown = serializeTree({ type: "root", children: nodes } as Root);
  return { markdown, diagnostics };
}
