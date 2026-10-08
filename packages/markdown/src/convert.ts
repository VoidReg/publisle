import type { Root, RootContent } from "mdast";
import type {
  Block,
  Diagnostic,
  JsonValue,
  PublicationMetadata,
  SourceLocation,
} from "@publisle/schema";
import {
  createBlock,
  document,
  isBlockType,
  parseBlockId,
  parsePublicationMetadata,
  parseJson,
  SchemaParseError,
} from "@publisle/schema";
import type { FlowNode, InlineNode } from "@publisle/blocks-core";
import YAML from "yaml";
import { deterministicBlockId } from "./id.ts";
import { sourceLocator } from "./source.ts";
import { codecRegistry, importedVersion } from "./codecs.ts";
import type { MarkdownImportOptions } from "./types.ts";
import type { ContainerDirective } from "mdast-util-directive";

type Node = RootContent | { type: string; [key: string]: unknown };
const object = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;
const children = (node: unknown): Node[] =>
  Array.isArray(object(node)["children"])
    ? (object(node)["children"] as Node[])
    : [];

function resolveReferences(
  node: Node,
  definitions: ReadonlyMap<string, { url: string; title?: string }>,
): Node {
  const data = object(node);
  if (node.type === "linkReference" || node.type === "imageReference") {
    const definition = definitions.get(
      String(data["identifier"] ?? "").toLowerCase(),
    );
    if (definition) {
      if (node.type === "imageReference")
        return {
          ...node,
          type: "image",
          url: definition.url,
          alt: String(data["alt"] ?? ""),
          ...(definition.title === undefined
            ? {}
            : { title: definition.title }),
        };
      return {
        ...node,
        type: "link",
        url: definition.url,
        ...(definition.title === undefined ? {} : { title: definition.title }),
        children: children(node).map((child) =>
          resolveReferences(child, definitions),
        ),
      };
    }
  }
  return children(node).length
    ? {
        ...node,
        children: children(node).map((child) =>
          resolveReferences(child, definitions),
        ),
      }
    : node;
}

function textNodes(value: string): InlineNode[] {
  return value
    .split("\n")
    .flatMap((part, index) => [
      ...(index === 0 ? [] : [{ type: "softBreak" as const }]),
      ...(part.length === 0 ? [] : [{ type: "text" as const, value: part }]),
    ]);
}

function inline(nodes: readonly Node[]): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    const data = object(node);
    switch (node.type) {
      case "text":
        return textNodes(String(data["value"] ?? ""));
      case "emphasis":
      case "strong":
        return [{ type: node.type, children: inline(children(node)) }];
      case "delete":
        return [{ type: "strikethrough", children: inline(children(node)) }];
      case "inlineCode":
        return [{ type: "inlineCode", value: String(data["value"] ?? "") }];
      case "inlineMath":
        return [{ type: "inlineMath", value: String(data["value"] ?? "") }];
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
            type: "inlineImage",
            url: String(data["url"] ?? ""),
            alt: String(data["alt"] ?? ""),
            ...(typeof data["title"] === "string"
              ? { title: data["title"] }
              : {}),
          },
        ];
      case "break":
        return [{ type: "hardBreak" }];
      case "footnoteReference":
        return [
          {
            type: "footnoteReference",
            identifier: String(data["identifier"] ?? ""),
          },
        ];
      case "html":
        return [{ type: "rawHtml", value: String(data["value"] ?? "") }];
      case "textDirective": {
        const name = String(data["name"] ?? "");
        const attributes = attrs(node);
        const body = children(node)
          .map((child) => String(object(child)["value"] ?? ""))
          .join("")
          .trim();
        if (name === "ref")
          return [
            {
              type: "crossReference",
              target: attributes["target"] ?? body,
              ...(attributes["target"] && body
                ? { children: textNodes(body) }
                : {}),
            },
          ];
        if (name === "cite") {
          let items = body
            .split(";")
            .map((id) => ({ id: id.trim() }))
            .filter(({ id }) => id.length > 0);
          if (attributes["data"]) {
            try {
              const parsed = parseJson(
                decodeURIComponent(attributes["data"]),
              ) as typeof items;
              if (!Array.isArray(parsed))
                throw new Error("Expected citation array");
              items = parsed;
            } catch {
              throw new SchemaParseError(
                "invalid-block-data",
                "Citation data must be a strict JSON array.",
              );
            }
          } else if (items[0]) {
            items[0] = {
              ...items[0],
              ...(attributes["locator"]
                ? { locator: attributes["locator"] }
                : {}),
              ...(attributes["label"] ? { label: attributes["label"] } : {}),
              ...(attributes["suppressAuthor"] === "true"
                ? { suppressAuthor: true }
                : {}),
            };
          }
          return [
            {
              type: "citationReference",
              items,
              ...(attributes["prefix"] ? { prefix: attributes["prefix"] } : {}),
              ...(attributes["suffix"] ? { suffix: attributes["suffix"] } : {}),
            },
          ];
        }
        return textNodes(body);
      }
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
            items: children(node).map((item) =>
              typeof object(item)["checked"] === "boolean"
                ? {
                    type: "taskListItem",
                    checked: object(item)["checked"] as boolean,
                    children: flow(children(item)),
                  }
                : { type: "listItem", children: flow(children(item)) },
            ),
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
        const parsed: unknown = parseJson(String(object(child)["value"] ?? ""));
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
  locate: (node: unknown) => SourceLocation,
): Omit<Block, "id"> | undefined {
  const data = object(node);
  switch (node.type) {
    case "paragraph": {
      const content = inline(children(node));
      if (content.length === 1 && content[0]?.type === "inlineImage") {
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
      const slot = (slotName: string) =>
        children(node).find(
          (child) =>
            child.type === "containerDirective" &&
            String(object(child)["name"] ?? "") === slotName,
        );
      if (name === "heading") {
        const heading = children(node).find(
          (child) => child.type === "heading",
        );
        if (heading)
          return {
            type: "publisle:heading",
            schemaVersion: 1,
            data: {
              level: Number(object(heading)["depth"]),
              content: inline(children(heading)),
              ...(attributes["label"] ? { label: attributes["label"] } : {}),
            },
          } as Omit<Block, "id">;
      }
      if (name === "equation") {
        const equation = children(node).find((child) => child.type === "math");
        if (equation)
          return {
            type: "publisle:math",
            schemaVersion: 1,
            data: {
              value: String(object(equation)["value"] ?? ""),
              display: true,
              ...(attributes["label"] ? { label: attributes["label"] } : {}),
            },
          } as Omit<Block, "id">;
      }
      if (name === "figure") {
        const caption = slot("caption");
        const credit = slot("credit");
        const creditNodes = credit
          ? inlineFromFlow(flow(children(credit)), diagnostics)
          : undefined;
        return {
          type: "publisle:figure",
          schemaVersion: 1,
          data: {
            src: attributes["src"] ?? "",
            ...(attributes["alt"] === undefined
              ? {}
              : { alt: attributes["alt"] }),
            ...(attributes["title"] ? { title: attributes["title"] } : {}),
            ...(attributes["label"] ? { label: attributes["label"] } : {}),
            ...(caption ? { caption: flow(children(caption)) } : {}),
            ...(creditNodes ? { credit: creditNodes } : {}),
            ...(attributes["original"]
              ? {
                  original: {
                    src: attributes["original"],
                    ...(attributes["mediaType"]
                      ? { mediaType: attributes["mediaType"] }
                      : {}),
                    ...(attributes["filename"]
                      ? { filename: attributes["filename"] }
                      : {}),
                  },
                }
              : {}),
          },
        } as Omit<Block, "id">;
      }
      if (name === "table") {
        const table = children(node).find((child) => child.type === "table");
        if (table)
          return {
            type: "publisle:table",
            schemaVersion: 1,
            data: {
              align: (object(table)["align"] ?? []) as JsonValue,
              rows: children(table).map((row) =>
                children(row).map((cell) => inline(children(cell))),
              ),
              ...(attributes["label"] ? { label: attributes["label"] } : {}),
              ...(slot("caption")
                ? { caption: flow(children(slot("caption")!)) }
                : {}),
            },
          } as unknown as Omit<Block, "id">;
      }
      if (name === "embed") {
        const ratio = (attributes["ratio"] ?? "16/9").split("/").map(Number);
        return {
          type: "publisle:embed",
          schemaVersion: 1,
          data: {
            provider: attributes["provider"] ?? "",
            resourceId: attributes["resource"] ?? "",
            title: attributes["title"] ?? "",
            aspectRatio: { width: ratio[0] ?? 16, height: ratio[1] ?? 9 },
            ...(slot("caption")
              ? { caption: flow(children(slot("caption")!)) }
              : {}),
            ...(slot("fallback")
              ? { fallback: flow(children(slot("fallback")!)) }
              : {}),
          },
        } as Omit<Block, "id">;
      }
      if (name === "diagram") {
        const code = children(node).find((child) => child.type === "code");
        return {
          type: "publisle:diagram",
          schemaVersion: 1,
          data: {
            engine:
              attributes["engine"] ??
              String(code ? (object(code)["lang"] ?? "") : ""),
            source: String(code ? (object(code)["value"] ?? "") : ""),
            alt: attributes["alt"] ?? "",
            ...(attributes["label"] ? { label: attributes["label"] } : {}),
            ...(slot("caption")
              ? { caption: flow(children(slot("caption")!)) }
              : {}),
            ...(slot("fallback")
              ? { fallback: flow(children(slot("fallback")!)) }
              : {}),
            ...(attributes["print"]
              ? { printFallback: { src: attributes["print"] } }
              : {}),
          },
        } as Omit<Block, "id">;
      }
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
          const blockData = parseJson(
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
    | {
        start?: { line: number; column: number };
        end?: { line: number; column: number };
      }
    | undefined;
  const raw =
    position?.start === undefined || position.end === undefined
      ? ""
      : source.slice(
          locate(node).offset,
          locate({ position: { start: position.end } }).offset,
        );
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
  options: MarkdownImportOptions = {},
) {
  const locate = sourceLocator(source, options.sourceName);
  let codecs: ReturnType<typeof codecRegistry>;
  try {
    codecs = codecRegistry(options.codecs);
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "invalid-markdown-codecs",
      message: error instanceof Error ? error.message : String(error),
      sourceLocation: locate(tree),
    });
    return { sourceMap: { document: locate(tree), blocks: {} } };
  }
  const blockLocations: Record<string, SourceLocation> = {};
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
        sourceLocation: locate(yaml),
        message:
          error instanceof Error ? error.message : "Invalid YAML frontmatter.",
      });
    }
  }
  const occurrence = new Map<string, number>();
  const definitions = new Map<string, { url: string; title?: string }>();
  for (const node of tree.children) {
    if (node.type !== "definition") continue;
    definitions.set(node.identifier.toLowerCase(), {
      url: node.url,
      ...(node.title === null || node.title === undefined
        ? {}
        : { title: node.title }),
    });
  }
  const blocks: Block[] = [];
  for (const node of tree.children) {
    if (node.type === "yaml" || node.type === "definition") continue;
    const resolved = resolveReferences(node, definitions);
    const diagnosticStart = diagnostics.length;
    let block: ReturnType<typeof blockFor>;
    try {
      const attributes = attrs(resolved);
      const codec =
        resolved.type === "containerDirective"
          ? codecs.byDirective.get(String(object(resolved)["name"]))
          : undefined;
      if (codec) {
        const schemaVersion = importedVersion(
          codec.type,
          attributes["schemaVersion"],
          options,
          diagnostics,
          codec,
        );
        let data: unknown;
        try {
          data = codec.decode(structuredClone(resolved) as ContainerDirective, {
            schemaVersion,
            sourceLocation: locate(node),
          });
          // Establish the JSON boundary without interpreting or migrating plugin payloads.
          createBlock({ type: codec.type, schemaVersion, data });
        } catch (error) {
          diagnostics.push({
            level: "error",
            code: "markdown-codec-failed",
            message: `Decoding ${codec.type} failed: ${error instanceof Error ? error.message : String(error)}`,
            sourceLocation: locate(node),
          });
          continue;
        }
        block = { type: codec.type, schemaVersion, data } as Omit<Block, "id">;
      } else {
        block = blockFor(resolved, source, diagnostics, locate);
        if (
          block &&
          resolved.type === "containerDirective" &&
          block.type !== "publisle:raw-html" &&
          object(resolved)["name"] !== "publisle"
        ) {
          block = {
            ...block,
            schemaVersion: importedVersion(
              block.type,
              attributes["schemaVersion"],
              options,
              diagnostics,
            ),
          };
        }
      }
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "markdown-import-failed",
        message: error instanceof Error ? error.message : String(error),
        sourceLocation: locate(node),
      });
    }
    for (let index = diagnosticStart; index < diagnostics.length; index += 1) {
      const diagnostic = diagnostics[index]!;
      diagnostics[index] = {
        ...diagnostic,
        sourceLocation: diagnostic.sourceLocation ?? locate(node),
      };
    }
    if (!block) continue;
    const signature = JSON.stringify([
      block.type,
      block.schemaVersion,
      block.data,
    ]);
    const count = occurrence.get(signature) ?? 0;
    occurrence.set(signature, count + 1);
    const attributes = attrs(resolved);
    let id: ReturnType<typeof parseBlockId>;
    try {
      id = attributes["id"]
        ? parseBlockId(attributes["id"])
        : deterministicBlockId(block, count);
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "markdown-import-failed",
        message: error instanceof Error ? error.message : String(error),
        sourceLocation: locate(node),
      });
      continue;
    }
    try {
      blocks.push(createBlock({ ...block, id }));
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "markdown-import-failed",
        message: error instanceof Error ? error.message : String(error),
        blockId: id,
        sourceLocation: locate(node),
      });
      continue;
    }
    blockLocations[id] = locate(node);
    for (let index = diagnosticStart; index < diagnostics.length; index += 1) {
      diagnostics[index] = { ...diagnostics[index]!, blockId: id };
    }
  }
  return {
    document: document({
      ...(metadata === undefined ? {} : { metadata }),
      blocks,
    }),
    sourceMap: { document: locate(tree), blocks: blockLocations },
  };
}
