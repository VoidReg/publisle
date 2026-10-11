import type { Component } from "svelte";

declare const MathEditor: Component<{
  value: string;
  onchange: (value: string) => void;
  display?: boolean;
  compact?: boolean;
  collapsible?: boolean;
  ariaLabel?: string;
}>;
export default MathEditor;
