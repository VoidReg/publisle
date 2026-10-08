import type {
  AdapterTarget,
  RenderNode,
  RenderPlan,
} from "@publisle/adapter-core";
import {
  placementProgram,
  javascriptValue as js,
} from "@publisle/adapter-core";

const html = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type StaticComponent = Extract<RenderNode, { kind: "component" }>;

function emitNode(
  node: RenderNode,
  islands: Extract<RenderNode, { kind: "island" }>[],
  components: StaticComponent[],
  placed = false,
): string {
  if (node.kind === "text") return html(node.value);
  if (node.kind === "raw") return `{@html ${js(node.value)}}`;
  if (node.kind === "island") {
    const index = islands.push(node) - 1;
    return `<div class="publisle-island" aria-label="${html(node.label)}"><div bind:this={fallback${index}}>${node.fallback.map((child) => emitNode(child, islands, components, placed)).join("")}</div><div bind:this={root${index}} hidden></div></div>`;
  }
  if (node.kind === "component") {
    let index = components.findIndex(
      (component) =>
        component.module === node.module &&
        component.exportName === node.exportName,
    );
    if (index < 0) index = components.push(node) - 1;
    return `<PublisleStatic${index} {...${js(node.props)}} />`;
  }
  const attributes = placed
    ? ` {...publislePlace(${js(node.attributes)}, publislePlacement)}`
    : Object.entries(node.attributes)
        .map(([key, value]) =>
          typeof value === "boolean"
            ? value
              ? ` ${key}`
              : ""
            : ` ${key}="${html(String(value))}"`,
        )
        .join("");
  return `<${node.tag}${attributes}>${node.children.map((child) => emitNode(child, islands, components, placed)).join("")}</${node.tag}>`;
}

export const svelteTarget: AdapterTarget = {
  name: "svelte",
  extension: "svelte",
  emitModule(plan: RenderPlan): string {
    const islands: Extract<RenderNode, { kind: "island" }>[] = [];
    const components: StaticComponent[] = [];
    const placement = placementProgram(plan.nodes);
    const markup = plan.nodes
      .map((node) => emitNode(node, islands, components, placement !== ""))
      .join("\n");
    const imports = components
      .map(
        (node, index) =>
          `import { ${js(node.exportName)} as PublisleStatic${index} } from ${js(node.module)};`,
      )
      .join("\n");
    const islandScript = islands.length
      ? `import { onMount, mount, unmount } from "svelte";\nimport { createIslandController } from "@publisle/adapter-svelte/runtime";\n${islands.map((_, index) => `let root${index}; let fallback${index};`).join("\n")}\nonMount(() => {\n const controllers = [${islands.map((node, index) => `createIslandController({ root: root${index}, fallback: fallback${index}, activation: ${js(node.activation)}, props: ${js(node.props)}, load: () => import(${js(node.module)}), mount: (mod, root, props) => mount(mod[${js(node.exportName)}], { target: root, props }), unmount })`).join(",\n")}];\n return () => controllers.forEach((controller) => controller.destroy());\n});\n`
      : "";
    const script =
      components.length || islands.length || placement
        ? `<script>\n${imports}\n${placement}\n${placement ? 'const publisleDefault=$props.id();let {instanceId}=$props();const publislePlacement=$derived(instanceId??("publisle"+publisleDefault.replace(/[^A-Za-z0-9_-]/g,"_")));' : ""}\n${islandScript}</script>\n`
        : "";
    return `<script module>\nexport const document = ${js(plan.document)};\nexport const metadata = ${js(plan.metadata ?? null)};\nexport const diagnostics = ${js(plan.diagnostics)};\n</script>\n${script}${markup}`;
  },
};
