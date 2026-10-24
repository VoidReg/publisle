import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import type { BlockRegistry } from "@publisle/core";
import {
  createBlock,
  document,
  parseDocument,
  type BlockId,
  type Diagnostic,
  type Document,
  type PublicationMetadata,
  type UnknownBlock,
} from "@publisle/schema";
import { defaultData, type PlaygroundExtensions } from "./templates.ts";

export { CORE_BLOCK_TYPES, blockTypes, defaultData } from "./templates.ts";
export type { BlockType } from "./templates.ts";

/**
 * Registry used by playground editors. Hosts append framework or demo block
 * definitions; the core Publisle blocks are always available.
 */
export function createPlaygroundRegistry(
  definitions: readonly unknown[] = [],
): BlockRegistry {
  return createRegistry([...coreBlockDefinitions, ...(definitions as never[])]);
}

export type DocumentEditorListener = () => void;

export interface ImportResult {
  readonly diagnostics: readonly Diagnostic[];
}

export class DocumentEditor {
  private current: Document;
  private listeners = new Set<DocumentEditorListener>();
  readonly registry: BlockRegistry;
  readonly extensions: PlaygroundExtensions | undefined;

  constructor(
    initial?: Document,
    registry: BlockRegistry = createPlaygroundRegistry(),
    extensions?: PlaygroundExtensions,
  ) {
    this.current = initial ?? document({ blocks: [] });
    this.registry = registry;
    this.extensions = extensions;
  }

  get document(): Document {
    return this.current;
  }

  subscribe(listener: DocumentEditorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  setMetadata(metadata: PublicationMetadata | undefined): void {
    const base = {
      schemaVersion: this.current.schemaVersion,
      blocks: this.current.blocks,
    };
    this.setDocument(
      metadata === undefined ? { ...base } : { ...base, metadata },
    );
  }

  setDocument(next: Document): void {
    this.current = next;
    this.notify();
  }

  /** Replace blocks while preserving document metadata (never lossy). */
  private replaceBlocks(blocks: UnknownBlock[]): void {
    this.setDocument(
      document({
        blocks,
        ...(this.current.metadata ? { metadata: this.current.metadata } : {}),
      }),
    );
  }

  addBlock(type: string, index?: number): void {
    const block = createBlock({
      type: type as `${string}:${string}`,
      data: defaultData(type, this.extensions),
    }) as UnknownBlock;
    const blocks: UnknownBlock[] = [...this.current.blocks];
    const insertAt =
      index === undefined
        ? blocks.length
        : Math.max(0, Math.min(index, blocks.length));
    blocks.splice(insertAt, 0, block);
    this.replaceBlocks(blocks);
  }

  removeBlock(id: BlockId): void {
    this.replaceBlocks(this.current.blocks.filter((block) => block.id !== id));
  }

  moveBlock(id: BlockId, direction: "up" | "down"): void {
    const blocks = [...this.current.blocks];
    const index = blocks.findIndex((block) => block.id === id);
    if (index === -1) return;
    const newIndex =
      direction === "up"
        ? Math.max(0, index - 1)
        : Math.min(blocks.length - 1, index + 1);
    if (newIndex === index) return;
    const [moved] = blocks.splice(index, 1) as [UnknownBlock];
    blocks.splice(newIndex, 0, moved);
    this.replaceBlocks(blocks);
  }

  /** Deep-clone a block with a fresh ID, inserting the copy right after it. */
  duplicateBlock(id: BlockId): BlockId | undefined {
    const index = this.current.blocks.findIndex((block) => block.id === id);
    if (index === -1) return undefined;
    const source = this.current.blocks[index];
    if (!source) return undefined;
    const duplicate = createBlock({
      type: source.type as `${string}:${string}`,
      data: JSON.parse(JSON.stringify(source.data ?? {})) as unknown,
    }) as UnknownBlock;
    const blocks = [...this.current.blocks];
    blocks.splice(index + 1, 0, duplicate);
    this.replaceBlocks(blocks);
    return duplicate.id;
  }

  updateBlock(id: BlockId, data: unknown): void {
    this.replaceBlocks(
      this.current.blocks.map((block) =>
        block.id === id ? ({ ...block, data } as UnknownBlock) : block,
      ),
    );
  }

  toJson(): string {
    return JSON.stringify(this.current, null, 2);
  }

  fromJson(source: string): ImportResult {
    const diagnostics: Diagnostic[] = [];
    try {
      const parsed = JSON.parse(source) as unknown;
      const doc = parseDocument(parsed);
      this.setDocument(doc);
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "json-import-failed",
        message: error instanceof Error ? error.message : "JSON import failed.",
      });
    }
    return { diagnostics };
  }
}

export function inlineText(
  nodes:
    readonly { readonly type: string; readonly value?: string }[] | undefined,
): string {
  if (!nodes) return "";
  return nodes
    .map((node) => (node.type === "text" ? (node.value ?? "") : ""))
    .join("");
}

export function setInlineText(
  value: string,
): readonly [{ readonly type: "text"; readonly value: string }] {
  return [{ type: "text", value }];
}

export function flowText(
  nodes:
    | readonly {
        readonly type: string;
        readonly content?: readonly {
          readonly type: string;
          readonly value?: string;
        }[];
      }[]
    | undefined,
): string {
  if (!nodes) return "";
  return nodes
    .filter((node) => node.type === "paragraph")
    .map((node) => inlineText(node.content))
    .join("\n");
}

export function setFlowText(value: string): readonly {
  readonly type: "paragraph";
  readonly content: ReturnType<typeof setInlineText>;
}[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "paragraph" as const,
      content: setInlineText(line),
    }));
}

export function tableText(
  rows:
    | readonly (readonly (readonly {
        readonly type: string;
        readonly value?: string;
      }[])[])[]
    | undefined,
): string {
  if (!rows) return "";
  return rows
    .map((row) => row.map((cell) => inlineText(cell)).join(" | "))
    .join("\n");
}

export function setTableText(
  value: string,
): readonly (readonly { readonly type: "text"; readonly value: string }[])[] {
  return value.split("\n").map((line) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .map((cell) => ({ type: "text" as const, value: cell })),
  );
}
