import type { Root, RootContent } from "mdast";
import type {
  Block,
  Diagnostic,
  JsonValue,
  PublicationMetadata,
} from "@publisle/schema";
import {
  createBlock,
  document,
  isBlockType,
  parseBlockId,
  parsePublicationMetadata,
} from "@publisle/schema";
import type { FlowNode, InlineNode } from "@publisle/blocks-core";
import YAML from "yaml";
import { deterministicBlockId } from "./id.ts";

type Node = RootContent | { type: string; [key: string]: unknown };
const object = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;
const children = (node: unknown): Node[] =>
  Array.isArray(object(node)["children"])
    ? (object(node)["children"] as Node[])
    : [];

function inline(nodes: readonly Node[]): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    const data = object(node);
    switch (node.type) {
      case "text":
        return [{ type: "text", value: String(data["value"] ?? "") }];
      case "emphasis":
      case "strong":
      case "delete":
        return [{ type: node.type, children: inline(children(node)) }];
      case "inlineCode":
        return [{ type: "inlineCode", value: String(data["value"] ?? "") }];
      case "inlineMath":
        return [{ type: "math", value: String(data["value"] ?? "") }];
      case "link":
        return [
          {
            type: "link",
            url: String(data["url"] ?? ""),
            ...(typeof data["title"] === "string"
              ? { title: data["title"] }
              : {}),
            children: inline(children(node)),
          },
        ];
      case "image":
        return [
          {
            type: "image",
            url: String(data["url"] ?? ""),
            alt: String(data["alt"] ?? ""),
            ...(typeof data["title"] === "string"
              ? { title: data["title"] }
              : {}),
          },
        ];
      case "break":
        return [{ type: "break" }];
      case "footnoteReference":
        return [
          {
            type: "footnoteReference",
            identifier: String(data["identifier"] ?? ""),
          },
        ];
      case "html":
        return [{ type: "rawHtml", value: String(data["value"] ?? "") }];
      default:
        return [{ type: "text", value: String(data["value"] ?? "") }];
    }
  });
}

function flow(nodes: readonly Node[]): FlowNode[] {
  return nodes.flatMap((node): FlowNode[] => {
    const data = object(node);
    switch (node.type) {
      case "paragraph":
        return [{ type: "paragraph", content: inline(children(node)) }];
      case "heading":
        return [
          {
            type: "heading",
            level: Number(data["depth"]),
            content: inline(children(node)),
          },
        ];
      case "blockquote":
        return [{ type: "quote", children: flow(children(node)) }];
      case "list":
        return [
          {
            type: "list",
            ordered: data["ordered"] === true,
            ...(typeof data["start"] === "number"
              ? { start: data["start"] }
              : {}),
            items: children(node).map((item) => ({
              ...(typeof object(item)["checked"] === "boolean"
                ? { checked: object(item)["checked"] as boolean }
                : {}),
              children: flow(children(item)),
            })),
          },
        ];
      case "code":
        return [
          {
            type: "code",
            value: String(data["value"] ?? ""),
            ...(typeof data["lang"] === "string"
              ? { language: data["lang"] }
              : {}),
            ...(typeof data["meta"] === "string" ? { meta: data["meta"] } : {}),
          },
        ];
      case "thematicBreak":
        return [{ type: "divider" }];
      case "html":
        return [{ type: "rawHtml", value: String(data["value"] ?? "") }];
      default:
        return [];
    }
  });
}

function interactiveDiagnostic(message: string): Diagnostic {
  return {
    level: "error",
    code: "invalid-interactive-directive",
    message,
  };
}

function interactiveBlock(
  node: Node,
  attributes: Record<string, string>,
  diagnostics: Diagnostic[],
): Omit<Block, "id"> | undefined {
  const type = attributes["type"] ?? "";
  if (!isBlockType(type)) {
    diagnostics.push(
      interactiveDiagnostic(
        "Interactive directives require a namespaced type attribute.",
      ),
    );
    return undefined;
  }
  const activation = attributes["activation"] ?? "visible";
  if (
    activation !== "load" &&
    activation !== "visible" &&
    activation !== "idle" &&
    activation !== "interaction"
  ) {
    diagnostics.push(
      interactiveDiagnostic(
        "Interactive activation must be load, visible, idle, or interaction.",
      ),
    );
    return undefined;
  }
  const version = attributes["schemaVersion"];
  const schemaVersion = version === undefined ? 1 : Number(version);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    diagnostics.push(
      interactiveDiagnostic(
        "Interactive schemaVersion must be a positive integer.",
      ),
    );
    return undefined;
  }
  const content: {
    title?: ReturnType<typeof inline>;
    description?: ReturnType<typeof flow>;
    instructions?: ReturnType<typeof flow>;
  } = {};
  let fallback: ReturnType<typeof flow> | undefined;
  let payload: JsonValue | undefined;
  for (const child of children(node)) {
    if (child.type === "containerDirective") {
      const slot = String(object(child)["name"] ?? "");
      if (slot === "title") {
        const title = inlineFromFlow(flow(children(child)), diagnostics);
        if (!title) return undefined;
        content.title = title;
      } else if (slot === "description")
        content.description = flow(children(child));
      else if (slot === "instructions")
        content.instructions = flow(children(child));
      else if (slot === "fallback") fallback = flow(children(child));
      else {
        diagnostics.push(
          interactiveDiagnostic(`Unexpected interactive slot ${slot}.`),
        );
        return undefined;
      }
      continue;
    }
    if (child.type === "code" && object(child)["lang"] === "publisle-payload") {
      try {
        const parsed: unknown = JSON.parse(
          String(object(child)["value"] ?? ""),
        );
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        )
          throw new Error("payload must be an object");
        payload = parsed as JsonValue;
      } catch {
        diagnostics.push(
          interactiveDiagnostic("Interactive payload must be one JSON object."),
        );
        return undefined;
      }
      continue;
    }
    diagnostics.push(
      interactiveDiagnostic(`Unexpected interactive content ${child.type}.`),
    );
    return undefined;
  }
  if (!payload) {
    diagnostics.push(
      interactiveDiagnostic(
        "Interactive directives require a publisle-payload code block.",
      ),
    );
    return undefined;
  }
  const authoredLabel = attributes["label"];
  const legacyLabel = attributes["alt"];
  const label =
    authoredLabel !== undefined && authoredLabel.length > 0
      ? authoredLabel
      : legacyLabel;
  return {
    type,
    schemaVersion,
    data: {
      activation,
      ...(Object.keys(content).length ? { content } : {}),
      ...(fallback === undefined ? {} : { fallback }),
      ...(label ? { accessibility: { label } } : {}),
      payload,
    },
  } as Omit<Block, "id">;
}

function inlineFromFlow(
  nodes: FlowNode[],
  diagnostics: Diagnostic[],
): ReturnType<typeof inline> | undefined {
  const title: ReturnType<typeof inline> = [];
  for (const node of nodes) {
    if (node.type !== "paragraph") {
      diagnostics.push(
        interactiveDiagnostic("Interactive title must be inline content."),
      );
      return undefined;
    }
    title.push(...node.content);
  }
  return title;
}

function attrs(node: unknown): Record<string, string> {
  const value = object(node)["attributes"];
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

function blockFor(
  node: Node,
  source: string,
  diagnostics: Diagnostic[],
): Omit<Block, "id"> | undefined {
  const data = object(node);
  switch (node.type) {
    case "paragraph": {
      const content = inline(children(node));
      if (content.length === 1 && content[0]?.type === "image") {
        const image = content[0];
        return {
          type: "publisle:figure",
          schemaVersion: 1,
          data: {
            src: image.url,
            alt: image.alt,
            ...(image.title === undefined ? {} : { title: image.title }),
          },
        } as Omit<Block, "id">;
      }
      return {
        type: "publisle:paragraph",
        schemaVersion: 1,
        data: { content },
      } as Omit<Block, "id">;
    }
    case "heading":
      return {
        type: "publisle:heading",
        schemaVersion: 1,
        data: { level: Number(data["depth"]), content: inline(children(node)) },
      } as Omit<Block, "id">;
    case "list":
      return {
        type: "publisle:list",
        schemaVersion: 1,
        data: flow([node])[0] as JsonValue,
      };
    case "blockquote":
      return {
        type: "publisle:quote",
        schemaVersion: 1,
        data: { children: flow(children(node)) },
      } as Omit<Block, "id">;
    case "code":
      return {
        type: "publisle:code",
        schemaVersion: 1,
        data: {
          value: String(data["value"] ?? ""),
          ...(typeof data["lang"] === "string"
            ? { language: data["lang"] }
            : {}),
          ...(typeof data["meta"] === "string" ? { meta: data["meta"] } : {}),
        },
      } as Omit<Block, "id">;
    case "math":
      return {
        type: "publisle:math",
        schemaVersion: 1,
        data: { value: String(data["value"] ?? ""), display: true },
      } as Omit<Block, "id">;
    case "thematicBreak":
      return { type: "publisle:divider", schemaVersion: 1, data: {} };
    case "html":
      return {
        type: "publisle:raw-html",
        schemaVersion: 1,
        data: { value: String(data["value"] ?? ""), inline: false },
      } as Omit<Block, "id">;
    case "table":
      return {
        type: "publisle:table",
        schemaVersion: 1,
        data: {
          align: (data["align"] ?? []) as JsonValue,
          rows: children(node).map((row) =>
            children(row).map((cell) => inline(children(cell))),
          ),
        },
      } as unknown as Omit<Block, "id">;
    case "footnoteDefinition":
      return {
        type: "publisle:footnote",
        schemaVersion: 1,
        data: {
          identifier: String(data["identifier"] ?? ""),
          children: flow(children(node)),
        },
      } as Omit<Block, "id">;
    case "containerDirective": {
      const name = String(data["name"] ?? "");
      const attributes = attrs(node);
      if (name === "callout")
        return {
          type: "publisle:callout",
          schemaVersion: 1,
          data: {
            variant: attributes["variant"] ?? "note",
            ...(attributes["title"] ? { title: attributes["title"] } : {}),
            children: flow(children(node)),
          },
        } as Omit<Block, "id">;
      if (name === "interactive")
        return interactiveBlock(node, attributes, diagnostics);
      if (name === "publisle") {
        const code = children(node).find((child) => child.type === "code");
        try {
          const blockData = JSON.parse(
            String(code ? object(code)["value"] : "null"),
          ) as JsonValue;
          return {
            type: (attributes["type"] ??
              "publisle:unknown") as `${string}:${string}`,
            schemaVersion: Number(attributes["schemaVersion"] ?? 1),
            data: blockData,
          };
        } catch {
          diagnostics.push({
            level: "error",
            code: "invalid-publisle-directive",
            message: "Generic Publisle directive body must contain valid JSON.",
          });
          return undefined;
        }
      }
      break;
    }
  }
  const position = object(node)["position"] as
    { start?: { offset?: number }; end?: { offset?: number } } | undefined;
  const raw =
    position?.start?.offset === undefined || position.end?.offset === undefined
      ? ""
      : source.slice(position.start.offset, position.end.offset);
  diagnostics.push({
    level: "warning",
    code: "unknown-markdown-node",
    message: `Preserved unsupported Markdown node ${node.type} as raw content.`,
  });
  return {
    type: "publisle:raw-html",
    schemaVersion: 1,
    data: { value: raw, inline: false },
  } as Omit<Block, "id">;
}

const metadataKeys = new Set([
  "documentType",
  "title",
  "description",
  "language",
  "authors",
  "publishedAt",
  "modifiedAt",
  "identifiers",
  "license",
  "subjects",
  "image",
]);

export function treeToDocument(
  tree: Root,
  source: string,
  diagnostics: Diagnostic[],
) {
  let metadata: PublicationMetadata | undefined;
  const yaml = tree.children.find((node) => node.type === "yaml");
  if (yaml && "value" in yaml) {
    try {
      const parsed = YAML.parse(yaml.value) as Record<string, unknown>;
      const known: Record<string, unknown> = {};
      const extensions: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(parsed ?? {})) {
        if (metadataKeys.has(key)) known[key] = value;
        else extensions[key] = value as JsonValue;
      }
      metadata = parsePublicationMetadata(
        Object.keys(extensions).length ? { ...known, extensions } : known,
      );
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "invalid-frontmatter",
        message:
          error instanceof Error ? error.message : "Invalid YAML frontmatter.",
      });
    }
  }
  const occurrence = new Map<string, number>();
  const blocks: Block[] = [];
  for (const node of tree.children) {
    if (node.type === "yaml") continue;
    const block = blockFor(node, source, diagnostics);
    if (!block) continue;
    const signature = JSON.stringify([
      block.type,
      block.schemaVersion,
      block.data,
    ]);
    const count = occurrence.get(signature) ?? 0;
    occurrence.set(signature, count + 1);
    const attributes = attrs(node);
    const id = attributes["id"]
      ? parseBlockId(attributes["id"])
      : deterministicBlockId(block, count);
    blocks.push(createBlock({ ...block, id }));
  }
  return document({ ...(metadata === undefined ? {} : { metadata }), blocks });
}
