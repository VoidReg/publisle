import { useState } from "react";
import type { Block, BlockId, UnknownBlock } from "@publisle/schema";
import type { BlockType } from "@publisle/playground-core";
import {
  BLOCK_LABELS,
  flowText,
  inlineText,
  setFlowText,
  setInlineText,
  setTableText,
  tableText,
} from "@publisle/playground-core";

export interface BlockEditorProps {
  readonly block: Block;
  readonly onRemove: (id: BlockId) => void;
  readonly onMove: (id: BlockId, direction: "up" | "down") => void;
  readonly onUpdate: (id: BlockId, data: unknown) => void;
}

function isUnknownBlock(block: Block): block is UnknownBlock {
  return typeof block.data === "object" && block.data !== null;
}

export function BlockEditor({
  block,
  onRemove,
  onMove,
  onUpdate,
}: BlockEditorProps) {
  const label = BLOCK_LABELS[block.type as BlockType] ?? block.type;

  return (
    <section className="block-editor" data-block-type={block.type}>
      <header className="block-editor__header">
        <strong>{label}</strong>
        <div className="block-editor__actions">
          <button
            type="button"
            onClick={() => onMove(block.id, "up")}
            aria-label="Move block up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(block.id, "down")}
            aria-label="Move block down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onRemove(block.id)}
            aria-label="Remove block"
          >
            Remove
          </button>
        </div>
      </header>
      <div className="block-editor__body">{renderFields(block, onUpdate)}</div>
    </section>
  );
}

function renderFields(
  block: Block,
  onUpdate: (id: BlockId, data: unknown) => void,
) {
  if (!isUnknownBlock(block)) {
    return <p className="muted">Unsupported block data.</p>;
  }

  const data = block.data as Record<string, unknown>;

  switch (block.type) {
    case "publisle:paragraph":
      return (
        <label>
          Content
          <textarea
            rows={3}
            value={inlineText(data["content"] as never)}
            onChange={(event) =>
              onUpdate(block.id, {
                content: setInlineText(event.target.value),
              })
            }
          />
        </label>
      );
    case "publisle:heading":
      return (
        <>
          <label>
            Level
            <select
              value={String(data["level"] ?? 2)}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  level: Number(event.target.value),
                })
              }
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  H{level}
                </option>
              ))}
            </select>
          </label>
          <label>
            Content
            <textarea
              rows={2}
              value={inlineText(data["content"] as never)}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  content: setInlineText(event.target.value),
                })
              }
            />
          </label>
        </>
      );
    case "publisle:list":
      return (
        <label>
          Items (one per line)
          <textarea
            rows={4}
            value={listItemsText(data["items"])}
            onChange={(event) =>
              onUpdate(block.id, {
                ...data,
                items: setListItemsText(event.target.value),
              })
            }
          />
        </label>
      );
    case "publisle:quote":
      return (
        <label>
          Quote content
          <textarea
            rows={3}
            value={flowText(data["children"] as never)}
            onChange={(event) =>
              onUpdate(block.id, {
                children: setFlowText(event.target.value),
              })
            }
          />
        </label>
      );
    case "publisle:code":
      return (
        <>
          <label>
            Language
            <input
              type="text"
              value={String(data["language"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  language: event.target.value,
                })
              }
            />
          </label>
          <label>
            Code
            <textarea
              rows={5}
              value={String(data["value"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  value: event.target.value,
                })
              }
            />
          </label>
        </>
      );
    case "publisle:math":
      return (
        <label>
          Math expression
          <input
            type="text"
            value={String(data["value"] ?? "")}
            onChange={(event) =>
              onUpdate(block.id, {
                ...data,
                value: event.target.value,
              })
            }
          />
        </label>
      );
    case "publisle:figure":
      return (
        <>
          <label>
            Source
            <input
              type="text"
              value={String(data["src"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  src: event.target.value,
                })
              }
            />
          </label>
          <label>
            Alt text
            <input
              type="text"
              value={String(data["alt"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  alt: event.target.value,
                })
              }
            />
          </label>
          <label>
            Caption
            <textarea
              rows={2}
              value={flowText(data["caption"] as never)}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  caption: setFlowText(event.target.value),
                })
              }
            />
          </label>
        </>
      );
    case "publisle:table":
      return (
        <label>
          Table rows (cells separated by |)
          <textarea
            rows={4}
            value={tableText(data["rows"] as never)}
            onChange={(event) =>
              onUpdate(block.id, {
                ...data,
                rows: setTableText(event.target.value),
              })
            }
          />
        </label>
      );
    case "publisle:callout":
      return (
        <>
          <label>
            Variant
            <select
              value={String(data["variant"] ?? "info")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  variant: event.target.value,
                })
              }
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label>
            Title
            <input
              type="text"
              value={String(data["title"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  title: event.target.value,
                })
              }
            />
          </label>
          <label>
            Content
            <textarea
              rows={3}
              value={flowText(data["children"] as never)}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  children: setFlowText(event.target.value),
                })
              }
            />
          </label>
        </>
      );
    case "publisle:divider":
      return <p className="muted">A horizontal divider.</p>;
    case "publisle:embed":
      return (
        <>
          <label>
            Provider
            <input
              value={String(data["provider"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, provider: event.target.value })
              }
            />
          </label>
          <label>
            Resource ID
            <input
              value={String(data["resourceId"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, resourceId: event.target.value })
              }
            />
          </label>
          <label>
            Accessible title
            <input
              value={String(data["title"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, title: event.target.value })
              }
            />
          </label>
        </>
      );
    case "publisle:diagram":
      return (
        <>
          <label>
            Engine
            <input
              value={String(data["engine"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, engine: event.target.value })
              }
            />
          </label>
          <label>
            Alternative text
            <input
              value={String(data["alt"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, alt: event.target.value })
              }
            />
          </label>
          <label>
            Source
            <textarea
              rows={6}
              value={String(data["source"] ?? "")}
              onChange={(event) =>
                onUpdate(block.id, { ...data, source: event.target.value })
              }
            />
          </label>
        </>
      );
    case "demo:interactive-scene":
    case "publisle:interactive-schematic": {
      const content = contentRecord(data);
      const accessibility = accessibilityRecord(data);
      return (
        <>
          <label>
            Activation
            <select
              value={String(data["activation"] ?? "visible")}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  activation: event.target.value,
                })
              }
            >
              <option value="load">Load</option>
              <option value="visible">Visible</option>
              <option value="idle">Idle</option>
              <option value="interaction">Interaction</option>
            </select>
          </label>
          <label>
            Title
            <input
              type="text"
              value={inlineText(content["title"] as never)}
              onChange={(event) =>
                onUpdate(
                  block.id,
                  withContent(data, "title", setInlineText(event.target.value)),
                )
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={flowText(content["description"] as never)}
              onChange={(event) =>
                onUpdate(
                  block.id,
                  withContent(
                    data,
                    "description",
                    setFlowText(event.target.value),
                  ),
                )
              }
            />
          </label>
          <label>
            Instructions
            <textarea
              rows={3}
              value={flowText(content["instructions"] as never)}
              onChange={(event) =>
                onUpdate(
                  block.id,
                  withContent(
                    data,
                    "instructions",
                    setFlowText(event.target.value),
                  ),
                )
              }
            />
          </label>
          <label>
            Fallback
            <textarea
              rows={3}
              value={flowText(data["fallback"] as never)}
              onChange={(event) => {
                const fallback = setFlowText(event.target.value);
                const next = { ...data };
                if (fallback.length) next["fallback"] = fallback;
                else delete next["fallback"];
                onUpdate(block.id, next);
              }}
            />
          </label>
          <label>
            Accessible name
            <input
              type="text"
              value={String(accessibility["label"] ?? "")}
              onChange={(event) => {
                const label = event.target.value;
                const next = { ...data };
                if (label) next["accessibility"] = { label };
                else delete next["accessibility"];
                onUpdate(block.id, next);
              }}
            />
            <span className="muted">
              Used when the visible title cannot name the region.
            </span>
          </label>
          <PayloadField
            payload={data["payload"]}
            onChange={(payload) =>
              onUpdate(block.id, {
                ...data,
                payload,
              })
            }
          />
        </>
      );
    }
    default:
      return <p className="muted">No editor for this block type.</p>;
  }
}

function contentRecord(data: Record<string, unknown>): Record<string, unknown> {
  const content = data["content"];
  return typeof content === "object" &&
    content !== null &&
    !Array.isArray(content)
    ? { ...(content as Record<string, unknown>) }
    : {};
}

function accessibilityRecord(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const accessibility = data["accessibility"];
  return typeof accessibility === "object" &&
    accessibility !== null &&
    !Array.isArray(accessibility)
    ? (accessibility as Record<string, unknown>)
    : {};
}

function withContent(
  data: Record<string, unknown>,
  key: string,
  value: readonly unknown[],
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [entryKey, entry] of Object.entries(contentRecord(data))) {
    if (entryKey !== key) content[entryKey] = entry;
  }
  if (value.length) content[key] = value;
  const next = { ...data };
  if (Object.keys(content).length) next["content"] = content;
  else delete next["content"];
  return next;
}

function parsePayload(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function PayloadField({
  payload,
  onChange,
}: {
  payload: unknown;
  onChange: (payload: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(() =>
    JSON.stringify(payload ?? {}, null, 2),
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <label>
      Payload
      <textarea
        rows={6}
        spellCheck={false}
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          const parsed = parsePayload(value);
          if (!parsed) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          onChange(parsed);
        }}
      />
      <span className="muted">
        {invalid
          ? "Payload must be one JSON object."
          : "Developer-defined structure for this interactive block."}
      </span>
    </label>
  );
}

function listItemsText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => {
      const children = (item as { children?: unknown }).children;
      return flowText(children as never);
    })
    .join("\n");
}

function setListItemsText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "listItem" as const,
      children: [{ type: "paragraph" as const, content: setInlineText(line) }],
    }));
}
