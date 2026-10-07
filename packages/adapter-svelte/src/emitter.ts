import type {
  AdapterTarget,
  RenderNode,
  RenderPlan,
} from "@publisle/adapter-core";

const html = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const js = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

function emitNode(
  node: RenderNode,
  islands: Extract<RenderNode, { kind: "island" }>[],
): string {
  if (node.kind === "text") return html(node.value);
  if (node.kind === "raw") return `{@html ${js(node.value)}}`;
  if (node.kind === "island") {
    const index = islands.push(node) - 1;
    return `<div class="publisle-island" aria-label="${html(node.label)}"><div bind:this={fallback${index}}>${node.fallback.map((child) => emitNode(child, islands)).join("")}</div><div bind:this={root${index}} hidden></div></div>`;
  }
  if (node.kind === "component")
    return `<div data-publisle-static="${html(node.module)}" data-publisle-export="${html(node.exportName)}"></div>`;
  const attributes = Object.entries(node.attributes)
    .map(([key, value]) =>
      typeof value === "boolean"
        ? value
          ? ` ${key}`
          : ""
        : ` ${key}="${html(String(value))}"`,
    )
    .join("");
  return `<${node.tag}${attributes}>${node.children.map((child) => emitNode(child, islands)).join("")}</${node.tag}>`;
}

export const svelteTarget: AdapterTarget = {
  name: "svelte",
  extension: "svelte",
  emitModule(plan: RenderPlan): string {
    const islands: Extract<RenderNode, { kind: "island" }>[] = [];
    const markup = plan.nodes.map((node) => emitNode(node, islands)).join("\n");
    const script = islands.length
      ? `<script>\nimport { onMount, mount, unmount } from "svelte";\nimport { createIslandController } from "@publisle/adapter-svelte/runtime";\n${islands.map((_, index) => `let root${index}; let fallback${index};`).join("\n")}\nonMount(() => {\n const controllers = [${islands.map((node, index) => `createIslandController({ root: root${index}, fallback: fallback${index}, activation: ${js(node.activation)}, props: ${js(node.props)}, load: () => import(${js(node.module)}), mount: (mod, root, props) => mount(mod[${js(node.exportName)}], { target: root, props }), unmount })`).join(",\n")}];\n return () => controllers.forEach((controller) => controller.destroy());\n});\n</script>\n`
      : "";
    return `<script module>\nexport const document = ${js(plan.document)};\nexport const metadata = ${js(plan.metadata ?? null)};\nexport const diagnostics = ${js(plan.diagnostics)};\n</script>\n${script}${markup}`;
  },
};
