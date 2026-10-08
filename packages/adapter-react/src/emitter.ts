import type {
  AdapterTarget,
  RenderNode,
  RenderPlan,
} from "@publisle/adapter-core";
import { placementProgram } from "@publisle/adapter-core";

const js = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

type StaticComponent = Extract<RenderNode, { kind: "component" }>;

function emitNode(
  node: RenderNode,
  islands: Extract<RenderNode, { kind: "island" }>[],
  components: StaticComponent[],
  placed = false,
): string {
  if (node.kind === "text") return js(node.value);
  if (node.kind === "raw")
    return `jsx("span", { dangerouslySetInnerHTML: { __html: ${js(node.value)} } })`;
  if (node.kind === "island") {
    const index = islands.push(node) - 1;
    return `jsx(PublisleIsland, { activation: ${js(node.activation)}, label: ${js(node.label)}, props: publisleIslandProps${index}, load: publisleIslandLoad${index}, exportName: ${js(node.exportName)}, fallback: ${node.fallback.length > 1 ? "jsxs" : "jsx"}(Fragment, { children: ${emitChildren(node.fallback, islands, components, placed)} }) })`;
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
    ? `, children: ${emitChildren(node.children, islands, components, placed)}`
    : "";
  return `${node.children.length > 1 ? "jsxs" : "jsx"}(${js(node.tag)}, { ...${placed ? `publislePlace(${js(attributes)}, publislePlacement)` : js(attributes)}${children} })`;
}

function emitChildren(
  nodes: readonly RenderNode[],
  islands: Extract<RenderNode, { kind: "island" }>[],
  components: StaticComponent[],
  placed = false,
): string {
  if (nodes.length === 1 && nodes[0])
    return emitNode(nodes[0], islands, components, placed);
  return `[${nodes.map((node) => emitNode(node, islands, components, placed)).join(",")}]`;
}

export const reactTarget: AdapterTarget = {
  name: "react",
  extension: "jsx",
  emitModule(plan: RenderPlan): string {
    const islands: Extract<RenderNode, { kind: "island" }>[] = [];
    const components: StaticComponent[] = [];
    const placement = placementProgram(plan.nodes);
    const body = emitChildren(
      plan.nodes,
      islands,
      components,
      placement !== "",
    );
    const imports = components
      .map(
        (node, index) =>
          `import { ${js(node.exportName)} as PublisleStatic${index} } from ${js(node.module)};`,
      )
      .join("\n");
    const islandConstants = islands
      .map(
        (node, index) =>
          `const publisleIslandProps${index} = ${js(node.props)};\nconst publisleIslandLoad${index} = () => import(${js(node.module)});`,
      )
      .join("\n");
    return `import { Fragment${placement ? ", useId" : ""} } from "react";\nimport { jsx, jsxs } from "react/jsx-runtime";\n${imports}\n${islands.length ? 'import { PublisleIsland } from "@publisle/adapter-react/runtime";' : ""}\n${islandConstants}\n${placement}\nexport const document = ${js(plan.document)};\nexport const metadata = ${js(plan.metadata ?? null)};\nexport const diagnostics = ${js(plan.diagnostics)};\nexport default function PublisleMarkdown(${placement ? "{instanceId}={}" : ""}){ ${placement ? 'const generated=useId();const publislePlacement=instanceId??("publisle"+generated.replace(/[^A-Za-z0-9_-]/g,"_"));' : ""}return ${plan.nodes.length > 1 ? "jsxs" : "jsx"}(Fragment, { children: ${body} }); }\n`;
  },
};
