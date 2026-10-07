<script lang="ts">
  import { untrack } from "svelte";
  import type { Block, BlockId } from "@publisle/schema";
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

  interface Props {
    block: Block;
    onRemove: (id: BlockId) => void;
    onMove: (id: BlockId, direction: "up" | "down") => void;
    onUpdate: (id: BlockId, data: unknown) => void;
  }

  let { block, onRemove, onMove, onUpdate }: Props = $props();

  const label = $derived(
    BLOCK_LABELS[block.type as BlockType] ?? block.type,
  );

  const data = $derived(block.data as Record<string, unknown>);

  function listItemsText(items: unknown): string {
    if (!Array.isArray(items)) return "";
    return items
      .map((item) => {
        const children = (item as { children?: unknown }).children;
        return flowText(children as never);
      })
      .join("\n");
  }

  function contentRecord(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const content = value["content"];
    return typeof content === "object" &&
      content !== null &&
      !Array.isArray(content)
      ? { ...(content as Record<string, unknown>) }
      : {};
  }

  function withContent(
    value: Record<string, unknown>,
    key: string,
    nextValue: readonly unknown[],
  ): Record<string, unknown> {
    const content = contentRecord(value);
    if (nextValue.length) content[key] = nextValue;
    else delete content[key];
    const next = { ...value };
    if (Object.keys(content).length) next["content"] = content;
    else delete next["content"];
    return next;
  }

  function parsePayload(value: string): Record<string, unknown> | undefined {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return undefined;
      return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  let payloadDraft = $state(
    JSON.stringify(
      untrack(
        () => (block.data as Record<string, unknown>)["payload"] ?? {},
      ),
      null,
      2,
    ),
  );
  let payloadInvalid = $state(false);

  function setListItemsText(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({
        children: [
          { type: "paragraph" as const, content: setInlineText(line) },
        ],
      }));
  }
</script>

<section class="block-editor" data-block-type={block.type}>
  <header class="block-editor__header">
    <strong>{label}</strong>
    <div class="block-editor__actions">
      <button
        type="button"
        onclick={() => onMove(block.id, "up")}
        aria-label="Move block up"
      >
        ↑
      </button>
      <button
        type="button"
        onclick={() => onMove(block.id, "down")}
        aria-label="Move block down"
      >
        ↓
      </button>
      <button
        type="button"
        onclick={() => onRemove(block.id)}
        aria-label="Remove block"
      >
        Remove
      </button>
    </div>
  </header>
  <div class="block-editor__body">
    {#if block.type === "publisle:paragraph"}
      <label>
        Content
        <textarea
          rows={3}
          value={inlineText(data["content"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              content: setInlineText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:heading"}
      <label>
        Level
        <select
          onchange={(event) =>
            onUpdate(block.id, {
              ...data,
              level: Number(event.currentTarget.value),
            })
          }
        >
          {#each [1, 2, 3, 4, 5, 6] as level}
            <option
              value={level}
              selected={Number(data["level"] ?? 2) === level}
            >
              H{level}
            </option>
          {/each}
        </select>
      </label>
      <label>
        Content
        <textarea
          rows={2}
          value={inlineText(data["content"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              content: setInlineText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:list"}
      <label>
        Items (one per line)
        <textarea
          rows={4}
          value={listItemsText(data["items"])}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              items: setListItemsText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:quote"}
      <label>
        Quote content
        <textarea
          rows={3}
          value={flowText(data["children"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              children: setFlowText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:code"}
      <label>
        Language
        <input
          type="text"
          value={String(data["language"] ?? "")}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              language: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        Code
        <textarea
          rows={5}
          value={String(data["value"] ?? "")}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              value: event.currentTarget.value,
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:math"}
      <label>
        Math expression
        <input
          type="text"
          value={String(data["value"] ?? "")}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              value: event.currentTarget.value,
            })
          }
        />
      </label>
    {:else if block.type === "publisle:figure"}
      <label>
        Source
        <input
          type="text"
          value={String(data["src"] ?? "")}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              src: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        Alt text
        <input
          type="text"
          value={String(data["alt"] ?? "")}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              alt: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        Caption
        <textarea
          rows={2}
          value={inlineText(data["caption"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              caption: setInlineText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:table"}
      <label>
        Table rows (cells separated by |)
        <textarea
          rows={4}
          value={tableText(data["rows"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              rows: setTableText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:callout"}
      <label>
        Variant
        <select
          value={String(data["variant"] ?? "info")}
          onchange={(event) =>
            onUpdate(block.id, {
              ...data,
              variant: event.currentTarget.value,
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
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              title: event.currentTarget.value,
            })
          }
        />
      </label>
      <label>
        Content
        <textarea
          rows={3}
          value={flowText(data["children"] as never)}
          oninput={(event) =>
            onUpdate(block.id, {
              ...data,
              children: setFlowText(event.currentTarget.value),
            })
          }
        ></textarea>
      </label>
    {:else if block.type === "publisle:divider"}
      <p class="muted">A horizontal divider.</p>
    {:else if block.type === "publisle:interactive-schematic"}
      {@const content = contentRecord(data)}
      <label>
        Activation
        <select
          value={String(data["activation"] ?? "visible")}
          onchange={(event) =>
            onUpdate(block.id, {
              ...data,
              activation: event.currentTarget.value,
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
          oninput={(event) =>
            onUpdate(
              block.id,
              withContent(data, "title", setInlineText(event.currentTarget.value)),
            )}
        />
      </label>
      <label>
        Description
        <textarea
          rows={3}
          value={flowText(content["description"] as never)}
          oninput={(event) =>
            onUpdate(
              block.id,
              withContent(
                data,
                "description",
                setFlowText(event.currentTarget.value),
              ),
            )}
        ></textarea>
      </label>
      <label>
        Instructions
        <textarea
          rows={3}
          value={flowText(content["instructions"] as never)}
          oninput={(event) =>
            onUpdate(
              block.id,
              withContent(
                data,
                "instructions",
                setFlowText(event.currentTarget.value),
              ),
            )}
        ></textarea>
      </label>
      <label>
        Fallback
        <textarea
          rows={3}
          value={flowText(data["fallback"] as never)}
          oninput={(event) => {
            const fallback = setFlowText(event.currentTarget.value);
            const next = { ...data };
            if (fallback.length) next["fallback"] = fallback;
            else delete next["fallback"];
            onUpdate(block.id, next);
          }}
        ></textarea>
      </label>
      <label>
        Accessible name
        <input
          type="text"
          value={String(
            (
              data["accessibility"] as { label?: string } | undefined
            )?.label ?? "",
          )}
          oninput={(event) => {
            const label = event.currentTarget.value;
            const next = { ...data };
            if (label) next["accessibility"] = { label };
            else delete next["accessibility"];
            onUpdate(block.id, next);
          }}
        />
        <span class="muted">
          Used when the visible title cannot name the region.
        </span>
      </label>
      <label>
        Payload
        <textarea
          rows={6}
          spellcheck="false"
          value={payloadDraft}
          oninput={(event) => {
            const value = event.currentTarget.value;
            payloadDraft = value;
            const parsed = parsePayload(value);
            if (!parsed) {
              payloadInvalid = true;
              return;
            }
            payloadInvalid = false;
            onUpdate(block.id, { ...data, payload: parsed });
          }}
        ></textarea>
        <span class="muted">
          {payloadInvalid
            ? "Payload must be one JSON object."
            : "Developer-defined structure for this interactive block."}
        </span>
      </label>
    {:else}
      <p class="muted">No editor for this block type.</p>
    {/if}
  </div>
</section>
