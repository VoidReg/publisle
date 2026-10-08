import manifest from "./generated/mermaid.json" with { type: "json" };
import { urls } from "./generated/mermaid-assets.ts";
import { DiagramPreview } from "./diagram-preview.ts";
import { createMermaidFrame } from "./mermaid-frame.ts";

export { mermaidSources } from "./diagram-preview.ts";

export function createMermaidPreview(): DiagramPreview {
  let workspace: ReturnType<typeof createMermaidFrame> | undefined;
  return new DiagramPreview(
    manifest.map((asset) => ({ ...asset, url: urls[asset.file]! })),
    async (source, id) => {
      if (!workspace) {
        const runtime = await import("./mermaid-runtime.ts");
        // Reflect the namespace so production tree shaking preserves frame exports.
        workspace = createMermaidFrame(
          runtime.runtimeUrl,
          Object.keys(runtime),
        );
      }
      return workspace.render(source, id);
    },
    undefined,
    () => {
      workspace?.dispose();
      workspace = undefined;
    },
  );
}
