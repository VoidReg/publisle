import type { Component } from "svelte";
import type { RenderPlan } from "@publisle/adapter-core";

declare const PublisleContent: Component<{
  plan: RenderPlan;
  islands?: Readonly<Record<string, Component>>;
}>;
export default PublisleContent;
