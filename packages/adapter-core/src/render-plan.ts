import {
  isInteractiveEnvelope,
  type Block,
  type BlockType,
  type Diagnostic,
  type InteractiveEnvelope,
  type JsonObject,
  type JsonValue,
  type PreparedDocument,
} from "@publisle/schema";
import type {
  AdapterCompilerOptions,
  IslandRendererReference,
  RenderNode,
  RenderPlan,
} from "./types.ts";

type Inline = { type: string; [key: string]: unknown };
type Flow = { type: string; [key: string]: unknown };
const text = (value: string): RenderNode => ({ kind: "text", value });
const element = (
  tag: string,
  attributes: Record<string, string | number | boolean>,
  children: readonly RenderNode[],
): RenderNode => ({ kind: "element", tag, attributes, children });

function safeUrl(url: string): string | undefined {
  const normalized = url.trim().toLowerCase();
  return /^(?:javascript|vbscript|data):/u.test(normalized) ? undefined : url;
}

function inline(
  nodes: readonly Inline[],
  diagnostics: Diagnostic[],
  block: Block<BlockType, unknown>,
): RenderNode[] {
  return nodes.flatMap((node): RenderNode[] => {
    switch (node.type) {
      case "text":
        return [text(String(node["value"] ?? ""))];
      case "emphasis":
        return [
          element(
            "em",
            {},
            inline(node["children"] as Inline[], diagnostics, block),
          ),
        ];
      case "strong":
        return [
          element(
            "strong",
            {},
            inline(node["children"] as Inline[], diagnostics, block),
          ),
        ];
      case "delete":
        return [
          element(
            "del",
            {},
            inline(node["children"] as Inline[], diagnostics, block),
          ),
        ];
      case "inlineCode":
        return [element("code", {}, [text(String(node["value"] ?? ""))])];
      case "math":
        return [
          element("span", { class: "publisle-math" }, [
            text(String(node["value"] ?? "")),
          ]),
        ];
      case "break":
        return [element("br", {}, [])];
      case "footnoteReference": {
        const localId = `footnote-${String(node["identifier"] ?? "")}`;
        return [
          element("sup", {}, [
            element(
              "a",
              { href: `#${localId}`, "data-publisle-ref": localId },
              [text(String(node["identifier"] ?? ""))],
            ),
          ]),
        ];
      }
      case "rawHtml":
        return [
          element("pre", { "data-publisle-raw-html": true }, [
            text(String(node["value"] ?? "")),
          ]),
        ];
      case "link": {
        const url = safeUrl(String(node["url"] ?? ""));
        if (!url)
          diagnostics.push({
            level: "warning",
            code: "unsafe-url",
            message: "An unsafe link URL was removed.",
            blockId: block.id,
          });
        return [
          element(
            "a",
            url ? { href: url } : {},
            inline(node["children"] as Inline[], diagnostics, block),
          ),
        ];
      }
      case "image": {
        const url = safeUrl(String(node["url"] ?? ""));
        if (!url)
          diagnostics.push({
            level: "warning",
            code: "unsafe-url",
            message: "An unsafe image URL was removed.",
            blockId: block.id,
          });
        return [
          element(
            "img",
            { ...(url ? { src: url } : {}), alt: String(node["alt"] ?? "") },
            [],
          ),
        ];
      }
      default:
        return [];
    }
  });
}

function flow(
  nodes: readonly Flow[],
  diagnostics: Diagnostic[],
  block: Block<BlockType, unknown>,
): RenderNode[] {
  return nodes.flatMap((node): RenderNode[] => {
    switch (node.type) {
      case "paragraph":
        return [
          element(
            "p",
            {},
            inline(node["content"] as Inline[], diagnostics, block),
          ),
        ];
      case "heading":
        return [
          element(
            `h${Number(node["level"])}`,
            {},
            inline(node["content"] as Inline[], diagnostics, block),
          ),
        ];
      case "quote":
        return [
          element(
            "blockquote",
            {},
            flow(node["children"] as Flow[], diagnostics, block),
          ),
        ];
      case "code":
        return [
          element("pre", {}, [
            element(
              "code",
              typeof node["language"] === "string"
                ? { class: `language-${node["language"]}` }
                : {},
              [text(String(node["value"] ?? ""))],
            ),
          ]),
        ];
      case "divider":
        return [element("hr", {}, [])];
      case "rawHtml":
        return [
          element("pre", { "data-publisle-raw-html": true }, [
            text(String(node["value"] ?? "")),
          ]),
        ];
      case "list": {
        const ordered = node["ordered"] === true;
        const items = node["items"] as {
          checked?: boolean;
          children: Flow[];
        }[];
        return [
          element(
            ordered ? "ol" : "ul",
            ordered && typeof node["start"] === "number"
              ? { start: node["start"] }
              : {},
            items.map((item) =>
              element("li", {}, [
                ...(typeof item.checked === "boolean"
                  ? [
                      element(
                        "input",
                        {
                          type: "checkbox",
                          disabled: true,
                          ...(item.checked ? { checked: true } : {}),
                        },
                        [],
                      ),
                    ]
                  : []),
                ...flow(item.children, diagnostics, block),
              ]),
            ),
          ),
        ];
      }
      default:
        return [];
    }
  });
}

function inlinePlain(nodes: readonly JsonValue[]): string {
  return nodes
    .map((node) => {
      if (typeof node !== "object" || node === null || Array.isArray(node))
        return "";
      const record = node as Record<string, JsonValue>;
      if (record["type"] === "text" && typeof record["value"] === "string")
        return record["value"];
      return Array.isArray(record["children"])
        ? inlinePlain(record["children"])
        : "";
    })
    .join("");
}

function envelopeProps(envelope: InteractiveEnvelope<JsonObject>): JsonValue {
  const props: Record<string, JsonValue> = {
    activation: envelope.activation,
    payload: envelope.payload,
  };
  if (envelope.content !== undefined)
    props["content"] = envelope.content as JsonValue;
  if (envelope.fallback !== undefined) props["fallback"] = envelope.fallback;
  if (envelope.accessibility !== undefined)
    props["accessibility"] = envelope.accessibility as JsonValue;
  return props;
}

function nonempty(value: string | undefined, fallback: string): string {
  return value !== undefined && value.length > 0 ? value : fallback;
}

function accessibleName(envelope: InteractiveEnvelope<JsonObject>): string {
  const title = envelope.content?.title
    ? inlinePlain(envelope.content.title).trim()
    : "";
  return nonempty(
    envelope.accessibility?.label,
    nonempty(title, "Interactive"),
  );
}

function exploreLabel(envelope: InteractiveEnvelope<JsonObject>): string {
  const title = envelope.content?.title
    ? inlinePlain(envelope.content.title).trim()
    : "";
  const name = nonempty(title, envelope.accessibility?.label ?? "");
  return name.length > 0 ? `Explore ${name}` : "Explore";
}

function interactiveReference(
  renderer: IslandRendererReference,
): { module: string; exportName: string } | undefined {
  if (renderer.interactive)
    return {
      module: renderer.interactive.module,
      exportName: renderer.interactive.exportName ?? "default",
    };
  if (renderer.module)
    return {
      module: renderer.module,
      exportName: renderer.exportName ?? "default",
    };
  return undefined;
}

function interactiveNodes(
  block: Block<BlockType, unknown>,
  envelope: InteractiveEnvelope<JsonObject>,
  options: AdapterCompilerOptions,
  diagnostics: Diagnostic[],
): RenderNode[] {
  const renderer = options.renderers?.[block.type];
  const interactive = renderer ? interactiveReference(renderer) : undefined;
  const staticRenderer = renderer?.static;
  const description = envelope.content?.description;
  const hasDescription = Array.isArray(description) && description.length > 0;
  const hasFallback =
    Array.isArray(envelope.fallback) && envelope.fallback.length > 0;
  if (!staticRenderer && !hasFallback && !hasDescription) {
    diagnostics.push({
      level: "warning",
      code: "missing-static-representation",
      message: `Interactive block ${block.type} has no static representation.`,
      blockId: block.id,
    });
  }
  const explanation: RenderNode[] = [];
  if (envelope.content?.title?.length) {
    explanation.push(
      element(
        "p",
        { class: "publisle-interactive-title" },
        inline(envelope.content.title as Inline[], diagnostics, block),
      ),
    );
  }
  if (hasDescription)
    explanation.push(
      ...flow(description as unknown as Flow[], diagnostics, block),
    );
  if (envelope.content?.instructions?.length)
    explanation.push(
      ...flow(
        envelope.content.instructions as unknown as Flow[],
        diagnostics,
        block,
      ),
    );
  const visualization: RenderNode[] = staticRenderer
    ? [
        {
          kind: "component",
          module: staticRenderer.module,
          exportName: staticRenderer.exportName ?? "default",
          props: envelopeProps(envelope),
        },
      ]
    : hasFallback
      ? flow(envelope.fallback as unknown as Flow[], diagnostics, block)
      : [];
  const region = (children: readonly RenderNode[]): RenderNode[] => [
    element("section", { class: "publisle-interactive" }, children),
  ];
  if (!interactive) {
    diagnostics.push({
      level: "warning",
      code: "missing-island-renderer",
      message: `No island renderer is configured for ${block.type}.`,
      blockId: block.id,
    });
    return region([...explanation, ...visualization]);
  }
  const fallback = [...visualization];
  if (envelope.activation === "interaction") {
    fallback.push(
      element("button", { type: "button", "data-publisle-activate": "true" }, [
        text(exploreLabel(envelope)),
      ]),
    );
  }
  return region([
    ...explanation,
    {
      kind: "island",
      blockId: block.id,
      activation: envelope.activation,
      label: accessibleName(envelope),
      module: interactive.module,
      exportName: interactive.exportName,
      props: envelopeProps(envelope),
      fallback,
    },
  ]);
}

function blockNodes(
  block: Block<BlockType, unknown>,
  options: AdapterCompilerOptions,
  diagnostics: Diagnostic[],
): RenderNode[] {
  if (isInteractiveEnvelope(block.data))
    return interactiveNodes(block, block.data, options, diagnostics);
  const data = block.data as Record<string, unknown>;
  switch (block.type) {
    case "publisle:paragraph":
      return [
        element(
          "p",
          {},
          inline(data["content"] as Inline[], diagnostics, block),
        ),
      ];
    case "publisle:heading":
      return [
        element(
          `h${Number(data["level"])}`,
          { "data-publisle-id": block.id },
          inline(data["content"] as Inline[], diagnostics, block),
        ),
      ];
    case "publisle:list":
      return flow([{ type: "list", ...data }], diagnostics, block);
    case "publisle:quote":
      return [
        element(
          "blockquote",
          {},
          flow(data["children"] as Flow[], diagnostics, block),
        ),
      ];
    case "publisle:code":
      return flow([{ type: "code", ...data }], diagnostics, block);
    case "publisle:math":
      return [
        element(
          data["display"] === true ? "div" : "span",
          { class: "publisle-math" },
          [text(String(data["value"] ?? ""))],
        ),
      ];
    case "publisle:divider":
      return [element("hr", {}, [])];
    case "publisle:figure": {
      const src = safeUrl(String(data["src"] ?? ""));
      if (!src)
        diagnostics.push({
          level: "warning",
          code: "unsafe-url",
          message: "An unsafe figure URL was removed.",
          blockId: block.id,
        });
      return [
        element("figure", {}, [
          element(
            "img",
            { ...(src ? { src } : {}), alt: String(data["alt"] ?? "") },
            [],
          ),
          ...(Array.isArray(data["caption"])
            ? [
                element(
                  "figcaption",
                  {},
                  inline(data["caption"] as Inline[], diagnostics, block),
                ),
              ]
            : []),
        ]),
      ];
    }
    case "publisle:table": {
      const rows = data["rows"] as Inline[][][];
      return [
        element("table", {}, [
          element(
            "tbody",
            {},
            rows.map((row, rowIndex) =>
              element(
                "tr",
                {},
                row.map((cell) =>
                  element(
                    rowIndex === 0 ? "th" : "td",
                    {},
                    inline(cell, diagnostics, block),
                  ),
                ),
              ),
            ),
          ),
        ]),
      ];
    }
    case "publisle:callout":
      return [
        element(
          "aside",
          {
            class: `publisle-callout publisle-callout-${String(data["variant"] ?? "note")}`,
          },
          [
            ...(typeof data["title"] === "string"
              ? [element("strong", {}, [text(data["title"])])]
              : []),
            ...flow(data["children"] as Flow[], diagnostics, block),
          ],
        ),
      ];
    case "publisle:footnote":
      return [
        element(
          "aside",
          { id: `footnote-${String(data["identifier"] ?? "")}` },
          flow(data["children"] as Flow[], diagnostics, block),
        ),
      ];
    case "publisle:raw-html":
      return options.rawHtml === "omit"
        ? []
        : options.rawHtml === "trusted" || typeof options.rawHtml === "function"
          ? [
              {
                kind: "raw",
                value:
                  typeof options.rawHtml === "function"
                    ? options.rawHtml(String(data["value"] ?? ""))
                    : String(data["value"] ?? ""),
              },
            ]
          : [
              element("pre", { "data-publisle-raw-html": true }, [
                text(String(data["value"] ?? "")),
              ]),
            ];
    default:
      diagnostics.push({
        level: "warning",
        code: "missing-renderer",
        message: `No renderer is available for ${block.type}.`,
        blockId: block.id,
      });
      return [
        element("div", { "data-publisle-unknown-block": block.type }, [
          text(`Unsupported block: ${block.type}`),
        ]),
      ];
  }
}

export function createRenderPlan(
  document: PreparedDocument,
  options: AdapterCompilerOptions = {},
): RenderPlan {
  const diagnostics: Diagnostic[] = [];
  const nodes = document.blocks.flatMap((block) =>
    blockNodes(block, options, diagnostics),
  );
  const base = { document, nodes, diagnostics };
  return document.metadata === undefined
    ? base
    : { ...base, metadata: document.metadata };
}
