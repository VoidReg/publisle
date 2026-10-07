import type {
  AdapterTarget,
  RenderNode,
  RenderPlan,
} from "@publisle/adapter-core";

const js = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

function emitNode(
  node: RenderNode,
  islands: Extract<RenderNode, { kind: "island" }>[],
): string {
  if (node.kind === "text") return js(node.value);
  if (node.kind === "raw")
    return `jsx("span", { dangerouslySetInnerHTML: { __html: ${js(node.value)} } })`;
  if (node.kind === "island") {
    islands.push(node);
    return `jsx(PublisleIsland, { activation: ${js(node.activation)}, label: ${js(node.label)}, props: ${js(node.props)}, load: () => import(${js(node.module)}), exportName: ${js(node.exportName)}, fallback: ${emitChildren(node.fallback, islands)} })`;
  }
  if (node.kind === "component")
    return `jsx("div", { "data-publisle-static": ${js(node.module)}, "data-publisle-export": ${js(node.exportName)} })`;
  const attributes = Object.fromEntries(
    Object.entries(node.attributes).map(([key, value]) => [
      key === "class" ? "className" : key,
      value,
    ]),
  );
  const children = node.children.length
    ? `, children: ${emitChildren(node.children, islands)}`
    : "";
  return `jsx(${js(node.tag)}, { ...${js(attributes)}${children} })`;
}

function emitChildren(
  nodes: readonly RenderNode[],
  islands: Extract<RenderNode, { kind: "island" }>[],
): string {
  if (nodes.length === 1 && nodes[0]) return emitNode(nodes[0], islands);
  return `[${nodes.map((node) => emitNode(node, islands)).join(",")}]`;
}

export const reactTarget: AdapterTarget = {
  name: "react",
  extension: "jsx",
  emitModule(plan: RenderPlan): string {
    const islands: Extract<RenderNode, { kind: "island" }>[] = [];
    const body = emitChildren(plan.nodes, islands);
    return `import { Fragment } from "react";\nimport { jsx } from "react/jsx-runtime";\n${islands.length ? 'import { PublisleIsland } from "@publisle/adapter-react/runtime";' : ""}\nexport const document = ${js(plan.document)};\nexport const metadata = ${js(plan.metadata ?? null)};\nexport const diagnostics = ${js(plan.diagnostics)};\nexport default function PublisleMarkdown(){ return jsx(Fragment, { children: ${body} }); }\n`;
  },
};
