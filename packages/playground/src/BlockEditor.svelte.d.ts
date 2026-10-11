import type { Component } from "svelte";
import type { Block, BlockId } from "@publisle/schema";
import type { PlaygroundExtensions } from "./templates.js";

declare const BlockEditor: Component<{
  block: Block;
  onRemove: (id: BlockId) => void;
  onMove: (id: BlockId, direction: "up" | "down") => void;
  onUpdate: (id: BlockId, data: unknown) => void;
  extensions?: PlaygroundExtensions;
}>;
export default BlockEditor;
