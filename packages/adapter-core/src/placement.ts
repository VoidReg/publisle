import type { RenderNode } from "./types.ts";

/** Build-time lowering to direct target code, not a reader document/contract interpreter. */
export function placementProgram(nodes: readonly RenderNode[]): string {
  const ids = new Set<string>();
  const visit = (entries: readonly RenderNode[]) => {
    for (const node of entries) {
      if (node.kind === "element") {
        const id = node.attributes["id"] ?? node.attributes["data-publisle-id"];
        if (typeof id === "string") ids.add(id);
        visit(node.children);
      } else if (node.kind === "island") visit(node.fallback);
    }
  };
  visit(nodes);
  if (!ids.size) return "";
  return `const publisleLocalIds=new Set(${JSON.stringify([...ids].sort()).replaceAll("<", "\\u003c")});
function publislePlace(attributes,placement){const result={...attributes};const local=attributes.id??attributes["data-publisle-id"];if(typeof local==="string")result.id=placement+"-"+local;
for(const name of ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-flowto","aria-activedescendant","aria-details","aria-errormessage","for","htmlFor","headers","list","form"]){const value=attributes[name];if(typeof value==="string")result[name]=value.split(/\\s+/).map(id=>publisleLocalIds.has(id)?placement+"-"+id:id).join(" ");}
for(const name of ["href","xlink:href"]){const value=attributes[name];if(typeof value==="string"&&value.startsWith("#")&&publisleLocalIds.has(value.slice(1)))result[name]="#"+placement+"-"+value.slice(1);}return result;}`;
}
