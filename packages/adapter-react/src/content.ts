import { Fragment, createElement, type ReactNode } from "react";
import type { RenderNode, RenderPlan } from "@publisle/adapter-core";
import { PublisleIsland, PublisleStatic } from "./runtime.ts";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export interface PublisleContentProps {
  readonly plan: RenderPlan;
  readonly islands?: Readonly<Record<string, () => Promise<unknown>>>;
}

function renderNode(
  node: RenderNode,
  islands: PublisleContentProps["islands"],
  key: number,
): ReactNode {
  if (node.kind === "text") return node.value;
  if (node.kind === "raw")
    return createElement("span", {
      key,
      dangerouslySetInnerHTML: { __html: node.value },
    });
  if (node.kind === "island") {
    const load = islands?.[node.module];
    if (!load)
      return createElement(
        Fragment,
        { key },
        node.fallback.map((child, index) => renderNode(child, islands, index)),
      );
    return createElement(PublisleIsland, {
      key,
      activation: node.activation,
      label: node.label,
      ...(node.provenance === undefined ? {} : { provenance: node.provenance }),
      props: node.props,
      load,
      exportName: node.exportName,
      fallback: node.fallback.map((child, index) =>
        renderNode(child, islands, index),
      ),
    });
  }
  if (node.kind === "component") {
    const load = islands?.[node.module];
    return createElement(PublisleStatic, {
      key,
      ...(load === undefined ? {} : { load }),
      exportName: node.exportName,
      props: node.props,
    });
  }
  const attributes = Object.fromEntries(
    Object.entries(node.attributes).map(([name, value]) => [
      name === "class" ? "className" : name,
      value,
    ]),
  );
  if (VOID_ELEMENTS.has(node.tag)) {
    return createElement(node.tag, { key, ...attributes });
  }
  return createElement(
    node.tag,
    { key, ...attributes },
    node.children.map((child, index) => renderNode(child, islands, index)),
  );
}

export function PublisleContent({
  plan,
  islands,
}: PublisleContentProps): ReactNode {
  return createElement(
    Fragment,
    null,
    plan.nodes.map((node, index) => renderNode(node, islands, index)),
  );
}
