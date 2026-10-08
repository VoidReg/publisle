import { MERMAID_CONFIG, validateMermaidSource } from "./mermaid-config.ts";
import { themeMermaidSvg } from "./mermaid-theme.ts";
export { diagramKey } from "./mermaid-config.ts";
export const runtimeUrl = import.meta.url;

/** This module, and Mermaid itself, are imported only for uncached previews. */
export async function renderMermaid(
  source: string,
  id: string,
): Promise<string> {
  validateMermaidSource(source);
  const { default: mermaid } = await import("mermaid");
  await document.fonts.ready;
  const config = structuredClone(MERMAID_CONFIG);
  mermaid.initialize({ ...config, secure: [...config.secure] });
  try {
    const { svg } = await mermaid.render(id, source);
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = parsed.documentElement;
    themeMermaidSvg(root);
    const bounds = root
      .getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number);
    if (bounds?.length === 4 && bounds[2]! > 0 && bounds[3]! > 0) {
      // Percentage-only SVG dimensions otherwise become a 300px-wide <img>.
      root.setAttribute("width", String(bounds[2]));
      root.setAttribute("height", String(bounds[3]));
    }
    return new XMLSerializer().serializeToString(root);
  } finally {
    // Mermaid can leave its temporary render container behind on syntax errors.
    document.getElementById(`d${id}`)?.remove();
  }
}
