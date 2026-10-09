import {
  javascriptValue as js,
  placementProgram,
  type AdapterTarget,
  type RenderNode,
} from "@publisle/adapter-core";
export const vueTarget: AdapterTarget = {
  name: "vue",
  extension: "js",
  emitModule(plan) {
    const components: Extract<RenderNode, { kind: "component" | "island" }>[] =
      [];
    const emit = (node: RenderNode): string => {
      if (node.kind === "text") return js(node.value);
      if (node.kind === "raw") return `h("span",{innerHTML:${js(node.value)}})`;
      if (node.kind === "component" || node.kind === "island") {
        const index = components.push(node) - 1;
        if (node.kind === "component")
          return `h(Static${index},${js(node.props)})`;
        return `h(PublisleIsland,{activation:${js(node.activation)},label:${js(node.label)},input:${js(node.props)},load:()=>import(${js(node.module)}),exportName:${js(node.exportName)}},{default:()=>[${node.fallback.map(emit).join(",")}]})`;
      }
      return `h(${js(node.tag)},publislePlace(${js(node.attributes)},placement),[${node.children.map(emit).join(",")}])`;
    };
    const body = plan.nodes.map(emit).join(",");
    const placement = placementProgram(plan.nodes);
    return `import {h,defineComponent,useId} from "vue";\n${components.some((node) => node.kind === "island") ? 'import {PublisleIsland} from "@publisle/adapter-vue/runtime";' : ""}\n${components.map((node, index) => (node.kind === "component" ? `import {${js(node.exportName)} as Static${index}} from ${js(node.module)};` : "")).join("\n")}\n${placement || "const publislePlace=(attributes)=>attributes;"}\nexport const metadata=${js(plan.metadata ?? null)};export const diagnostics=${js(plan.diagnostics)};export const document=${js(plan.document)};\nexport default defineComponent({props:{instanceId:String},setup(props){const id=useId();const placement=props.instanceId ?? ("publisle"+id.replace(/[^A-Za-z0-9_-]/g,"_"));return ()=>h("div",null,[${body}]);}});`;
  },
};
