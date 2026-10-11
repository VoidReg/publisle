import type { Component } from "svelte";
import type { Block } from "@publisle/schema";

declare const MathBlockEditor: Component<{
  block: Block;
  onUpdate: (id: Block["id"], data: unknown) => void;
  onSelect?: (id: Block["id"]) => void;
  selected?: boolean;
}>;
export default MathBlockEditor;
