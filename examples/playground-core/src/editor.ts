import { fourierDefinition } from "@publisle/example-fourier";
import { sceneDefinition } from "@publisle/example-scene";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import type { BlockRegistry } from "@publisle/core";
import {
  createPlaygroundRegistry,
  DocumentEditor as PlaygroundDocumentEditor,
} from "@publisle/playground";
import type { Diagnostic, Document } from "@publisle/schema";
import { BLOCK_TYPES, DEMO_EXTENSIONS, defaultData } from "./templates.ts";
import type { BlockType } from "./templates.ts";

export { BLOCK_TYPES, defaultData };
export type { BlockType };

export const CORE_REGISTRY: BlockRegistry = createPlaygroundRegistry([
  interactiveSchematicDefinition,
  sceneDefinition,
  fourierDefinition,
]);

export type DocumentEditorListener = () => void;

export interface ImportResult {
  readonly diagnostics: readonly Diagnostic[];
}

export class DocumentEditor extends PlaygroundDocumentEditor {
  constructor(initial?: Document) {
    super(initial, CORE_REGISTRY, DEMO_EXTENSIONS);
  }
}

export {
  flowText,
  inlineText,
  setFlowText,
  setInlineText,
  setTableText,
  tableText,
} from "@publisle/playground";
