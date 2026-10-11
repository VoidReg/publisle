import type { Component } from "svelte";

declare const JsonField: Component<{
  storageKey: string;
  value: unknown;
  label: string;
  onApply: (parsed: unknown) => void;
}>;
export default JsonField;
