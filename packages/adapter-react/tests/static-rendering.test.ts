import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RenderNode } from "@publisle/adapter-core";
import { nativeRenderingFixture } from "../../adapter-core/tests/native-rendering.ts";
import { reactTarget } from "../src/emitter.ts";

const component = (
  title: string,
  exportName = "default",
  module = "./Static.jsx",
): RenderNode => ({
  kind: "component",
  module,
  exportName,
  props: { title, count: 2, settings: { units: "Hz" } },
});
const files = {
  "Static.jsx": `import { createElement } from "react";
export default function Static({title,count,settings}) { return createElement("p", {"data-static":true}, title+": "+count+" "+settings.units); }
export { Static as Named };`,
  "Island.jsx": `export default function Island() { return null; }`,
  "server.js": `import Document from "./Document.jsx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
export const markup = renderToStaticMarkup(createElement(Document));`,
  // Retain the host's document component as a library export without mounting it.
  "client.js": `export { default as Document } from "./Document.jsx";`,
};
const fixture = (nodes: readonly RenderNode[]) =>
  nativeRenderingFixture({
    target: reactTarget,
    nodes,
    files,
    dependencyDirectory: fileURLToPath(
      new URL("../node_modules", import.meta.url),
    ),
    runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  });

describe("generated React static renderers", () => {
  it("SSR-renders default/named components and independent repeated props without an adapter runtime", async () => {
    const result = await fixture([
      component("First <safe>"),
      {
        kind: "element",
        tag: "section",
        attributes: {},
        children: [component("Second"), component("Named", "Named")],
      },
    ]);
    expect(result.markup).toContain("First &lt;safe&gt;: 2 Hz");
    expect(result.markup).toContain("Second: 2 Hz");
    expect(result.markup).toContain("Named: 2 Hz");
    expect(result.markup).not.toContain("data-publisle-static");
    expect(result.emitted.match(/as PublisleStatic0/g)).toHaveLength(1);
    expect(result.modules.some((id) => id.includes("Static.jsx"))).toBe(true);
    for (const id of result.modules) {
      expect(id).not.toMatch(
        /packages\/(?:adapter-react|adapter-core|schema|core|markdown|block-sdk)\//u,
      );
    }
    expect(result.code).not.toMatch(
      /createIslandController|PublisleIsland|data-publisle-static/u,
    );
  });

  it("renders static island fallback content in SSR before activation", async () => {
    const result = await fixture([
      {
        kind: "island",
        blockId: "island",
        activation: "interaction",
        label: "Example",
        module: "./Island.jsx",
        exportName: "default",
        props: {},
        fallback: [component("Available without JavaScript")],
      },
    ]);
    expect(result.markup).toContain("Available without JavaScript: 2 Hz");
    expect(result.markup).toContain("hidden");
    expect(result.emitted).toContain('import("./Island.jsx")');
  });

  it("fails the build for a missing static export instead of emitting an empty placeholder", async () => {
    await expect(
      fixture([component("Missing", "Unavailable")]),
    ).rejects.toThrow();
  });

  it("fails the build when the registered static module is unavailable", async () => {
    await expect(
      fixture([component("Missing", "default", "./Unavailable.jsx")]),
    ).rejects.toThrow();
  });
});
