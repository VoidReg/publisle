import { useEffect, useState } from "react";
import type { Block, BlockId } from "@publisle/schema";
import type { BlockType, FieldSpec } from "@publisle/playground-core";
import {
  BLOCK_LABELS,
  SEGMENT_KINDS,
  appendSegment,
  blockFields,
  fieldValue,
  flowText,
  inlineSegments,
  listText,
  removeSegment,
  setFieldJson,
  setFieldValue,
  setFlowText,
  setListText,
  setSegmentText,
  setTableText,
  tableText,
} from "@publisle/playground-core";

export interface BlockEditorProps {
  readonly block: Block;
  readonly onRemove: (id: BlockId) => void;
  readonly onMove: (id: BlockId, direction: "up" | "down") => void;
  readonly onUpdate: (id: BlockId, data: unknown) => void;
}

const dataOf = (block: Block): Record<string, unknown> =>
  typeof block.data === "object" && block.data !== null
    ? (block.data as Record<string, unknown>)
    : {};

export function BlockEditor({
  block,
  onRemove,
  onMove,
  onUpdate,
}: BlockEditorProps) {
  const label = BLOCK_LABELS[block.type as BlockType] ?? block.type;
  const specs = blockFields(block.type as BlockType);

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
      <div className="block-editor__body">
        {specs.length === 0 ? (
          <p className="muted">Nothing to configure.</p>
        ) : (
          specs.map((spec) => (
            <FieldControl
              key={spec.key + spec.kind}
              block={block}
              spec={spec}
              onUpdate={onUpdate}
            />
          ))
        )}
        <details className="payload-json">
          <summary>Payload JSON</summary>
          <JsonField
            storageKey={block.id}
            value={dataOf(block)}
            label="Full block data"
            onApply={(parsed) => onUpdate(block.id, parsed)}
          />
        </details>
      </div>
    </section>
  );
}

function FieldControl({
  block,
  spec,
  onUpdate,
}: {
  readonly block: Block;
  readonly spec: FieldSpec;
  readonly onUpdate: (id: BlockId, data: unknown) => void;
}) {
  const data = dataOf(block);
  const update = (value: string | boolean) =>
    onUpdate(block.id, setFieldValue(data, spec, value));

  if (spec.kind === "segments") {
    const nodes = data[spec.key];
    return (
      <fieldset className="field field--segments">
        <legend>{spec.label}</legend>
        {inlineSegments(nodes as readonly unknown[]).map((segment) => (
          <div className="segment" key={segment.index}>
            <span className="segment__label">{segment.label}</span>
            <input
              type="text"
              value={segment.value}
              placeholder={segment.placeholder ?? ""}
              onChange={(event) =>
                onUpdate(block.id, {
                  ...data,
                  [spec.key]: setSegmentText(
                    nodes as readonly unknown[],
                    segment.index,
                    event.target.value,
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label={`Remove ${segment.label}`}
              onClick={() =>
                onUpdate(block.id, {
                  ...data,
                  [spec.key]: removeSegment(
                    nodes as readonly unknown[],
                    segment.index,
                  ),
                })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <div className="segment segment--add">
          <AddSegment
            onAdd={(kind) =>
              onUpdate(block.id, {
                ...data,
                [spec.key]: appendSegment(nodes as readonly unknown[], kind),
              })
            }
          />
        </div>
      </fieldset>
    );
  }

  if (spec.kind === "json") {
    return (
      <details className="field field--json">
        <summary>{spec.label}</summary>
        <JsonField
          storageKey={block.id + spec.key}
          value={data[spec.key]}
          label={spec.label}
          onApply={(parsed) =>
            onUpdate(block.id, setFieldJson(data, spec, parsed))
          }
        />
      </details>
    );
  }

  const value = fieldValue(data, spec);

  if (spec.kind === "checkbox") {
    return (
      <label className="field field--check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => update(event.target.checked)}
        />{" "}
        {spec.label}
      </label>
    );
  }

  if (spec.kind === "select") {
    return (
      <label className="field">
        {spec.label}
        <select
          value={String(value)}
          onChange={(event) => update(event.target.value)}
        >
          {(spec.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (spec.kind === "flow" || spec.kind === "rows") {
    const text =
      spec.kind === "flow"
        ? flowText(data[spec.key] as never)
        : spec.key === "rows"
          ? tableText(data[spec.key] as never)
          : listText(data[spec.key]);
    const apply = (next: string) =>
      spec.kind === "flow"
        ? setFlowText(next)
        : spec.key === "rows"
          ? setTableText(next)
          : setListText(next);
    return (
      <label className="field">
        {spec.label}
        <textarea
          rows={spec.rows ?? 3}
          value={text}
          onChange={(event) =>
            onUpdate(block.id, {
              ...data,
              [spec.key]: apply(event.target.value),
            })
          }
        />
        {spec.hint ? <small className="muted">{spec.hint}</small> : null}
      </label>
    );
  }

  return (
    <label className="field">
      {spec.label}
      <input
        type={spec.kind === "textarea" ? "text" : spec.kind}
        value={String(value)}
        placeholder={spec.placeholder ?? ""}
        onChange={(event) => update(event.target.value)}
      />
      {spec.hint ? <small className="muted">{spec.hint}</small> : null}
    </label>
  );
}

function AddSegment({ onAdd }: { readonly onAdd: (kind: string) => void }) {
  const [kind, setKind] = useState("text");
  return (
    <>
      <select
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        aria-label="Inline content kind"
      >
        {SEGMENT_KINDS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd(kind)}>
        Add
      </button>
    </>
  );
}

function JsonField({
  storageKey,
  value,
  label,
  onApply,
}: {
  readonly storageKey: string;
  readonly value: unknown;
  readonly label: string;
  readonly onApply: (parsed: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
    setError(undefined);
  }, [storageKey, value]);
  return (
    <div>
      <textarea
        rows={6}
        aria-label={label}
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error ? (
        <p className="muted" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          try {
            onApply(JSON.parse(text) as unknown);
            setError(undefined);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Invalid JSON.");
          }
        }}
      >
        Apply JSON
      </button>
    </div>
  );
}
