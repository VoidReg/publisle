import { fourierDefinition } from "@publisle/example-fourier";
import { sceneDefinition } from "@publisle/example-scene";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry } from "@publisle/core";
import type { BlockRegistry } from "@publisle/core";
import { fromMarkdown, toMarkdown } from "@publisle/markdown";
import type {
  MarkdownExportOptions,
  MarkdownExportResult,
} from "@publisle/markdown";
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
import { BLOCK_TYPES, defaultData, type BlockType } from "./templates.ts";

export { BLOCK_TYPES, defaultData };
export type { BlockType };

export const CORE_REGISTRY: BlockRegistry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
  sceneDefinition,
  fourierDefinition,
]);

export type DocumentEditorListener = () => void;

export interface ImportResult {
  readonly diagnostics: readonly Diagnostic[];
}

export class DocumentEditor {
  private current: Document;
  private listeners = new Set<DocumentEditorListener>();
  readonly registry: BlockRegistry = CORE_REGISTRY;

  constructor(initial?: Document) {
    this.current = initial ?? document({ blocks: [] });
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

  addBlock(type: BlockType, index?: number): void {
    const block = createBlock({
      type,
      data: defaultData(type),
    }) as UnknownBlock;
    const blocks: UnknownBlock[] = [...this.current.blocks];
    const insertAt =
      index === undefined
        ? blocks.length
        : Math.max(0, Math.min(index, blocks.length));
    blocks.splice(insertAt, 0, block);
    this.setDocument(document({ blocks }));
  }

  removeBlock(id: BlockId): void {
    this.setDocument(
      document({
        blocks: this.current.blocks.filter((block) => block.id !== id),
      }),
    );
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
    this.setDocument(document({ blocks }));
  }

  updateBlock(id: BlockId, data: unknown): void {
    this.setDocument(
      document({
        blocks: this.current.blocks.map((block) =>
          block.id === id ? ({ ...block, data } as UnknownBlock) : block,
        ),
      }),
    );
  }

  importMarkdown(source: string): ImportResult {
    const imported = fromMarkdown(source, {
      resolveSchemaVersion: (type) => this.registry.get(type)?.schemaVersion,
    });
    if (imported.document) {
      this.setDocument(imported.document);
    }
    return { diagnostics: imported.diagnostics };
  }

  exportMarkdown(options: MarkdownExportOptions = {}): MarkdownExportResult {
    return toMarkdown(this.current, options);
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
