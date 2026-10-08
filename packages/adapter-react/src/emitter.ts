import type {
  AdapterTarget,
  RenderNode,
  RenderPlan,
} from "@publisle/adapter-core";

const js = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

type StaticComponent = Extract<RenderNode, { kind: "component" }>;

function emitNode(
  node: RenderNode,
  islands: Extract<RenderNode, { kind: "island" }>[],
  components: StaticComponent[],
): string {
  if (node.kind === "text") return js(node.value);
  if (node.kind === "raw")
    return `jsx("span", { dangerouslySetInnerHTML: { __html: ${js(node.value)} } })`;
  if (node.kind === "island") {
    islands.push(node);
    return `jsx(PublisleIsland, { activation: ${js(node.activation)}, label: ${js(node.label)}, props: ${js(node.props)}, load: () => import(${js(node.module)}), exportName: ${js(node.exportName)}, fallback: ${emitChildren(node.fallback, islands, components)} })`;
  }
  if (node.kind === "component") {
    let index = components.findIndex(
      (component) =>
        component.module === node.module &&
        component.exportName === node.exportName,
    );
    if (index < 0) index = components.push(node) - 1;
    return `jsx(PublisleStatic${index}, ${js(node.props)})`;
  }
  const attributes = Object.fromEntries(
    Object.entries(node.attributes).map(([key, value]) => [
      key === "class" ? "className" : key,
      value,
    ]),
  );
  const children = node.children.length
    ? `, children: ${emitChildren(node.children, islands, components)}`
    : "";
  return `jsx(${js(node.tag)}, { ...${js(attributes)}${children} })`;
}

function emitChildren(
  nodes: readonly RenderNode[],
  islands: Extract<RenderNode, { kind: "island" }>[],
  components: StaticComponent[],
): string {
  if (nodes.length === 1 && nodes[0])
    return emitNode(nodes[0], islands, components);
  return `[${nodes.map((node) => emitNode(node, islands, components)).join(",")}]`;
}

export const reactTarget: AdapterTarget = {
  name: "react",
  extension: "jsx",
  emitModule(plan: RenderPlan): string {
    const islands: Extract<RenderNode, { kind: "island" }>[] = [];
    const components: StaticComponent[] = [];
    const body = emitChildren(plan.nodes, islands, components);
    const imports = components
      .map(
        (node, index) =>
          `import { ${js(node.exportName)} as PublisleStatic${index} } from ${js(node.module)};`,
      )
      .join("\n");
    return `import { Fragment } from "react";\nimport { jsx } from "react/jsx-runtime";\n${imports}\n${islands.length ? 'import { PublisleIsland } from "@publisle/adapter-react/runtime";' : ""}\nexport const document = ${js(plan.document)};\nexport const metadata = ${js(plan.metadata ?? null)};\nexport const diagnostics = ${js(plan.diagnostics)};\nexport default function PublisleMarkdown(){ return jsx(Fragment, { children: ${body} }); }\n`;
  },
};
