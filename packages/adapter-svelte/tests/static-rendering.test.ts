import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "svelte/compiler";
import type { RenderNode } from "@publisle/adapter-core";
import { nativeRenderingFixture } from "../../adapter-core/tests/native-rendering.ts";
import { svelteTarget } from "../src/emitter.ts";

const component = (
  title: string,
  exportName = "default",
  module = "./Static.js",
): RenderNode => ({
  kind: "component",
  module,
  exportName,
  props: { title, count: 2, settings: { units: "Hz" } },
});
const files = {
  "Static.svelte": `<script>let {title,count,settings} = $props();</script><p data-static>{title}: {count} {settings.units}</p>`,
  "Static.js": `export { default, default as Named } from "./Static.svelte";`,
  "Island.svelte": `<p>Activated island</p>`,
  "server.js": `import Document from "./Document.svelte";
import { render } from "svelte/server";
export const markup = render(Document).body;`,
  "client.js": `export { default as Document } from "./Document.svelte";`,
};
const fixture = (nodes: readonly RenderNode[]) =>
  nativeRenderingFixture({
    target: svelteTarget,
    nodes,
    files,
    dependencyDirectory: fileURLToPath(
      new URL("../node_modules", import.meta.url),
    ),
    runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
    plugins: [
      {
        name: "compile-test-svelte",
        transform(source, id, options) {
          if (!id.endsWith(".svelte")) return undefined;
          return compile(source, {
            filename: id,
            generate: options?.ssr ? "server" : "client",
            css: "external",
          }).js;
        },
      },
    ],
  });

describe("generated Svelte static renderers", () => {
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
    expect(result.markup).toContain("First &lt;safe>: 2 Hz");
    expect(result.markup).toContain("Second: 2 Hz");
    expect(result.markup).toContain("Named: 2 Hz");
    expect(result.markup).not.toContain("data-publisle-static");
    expect(result.emitted.match(/as PublisleStatic0/g)).toHaveLength(1);
    expect(result.modules.some((id) => id.includes("Static.svelte"))).toBe(
      true,
    );
    for (const id of result.modules) {
      expect(id).not.toMatch(
        /packages\/(?:adapter-svelte|adapter-core|schema|core|markdown|block-sdk)\//u,
      );
    }
    expect(result.code).not.toMatch(
      /createIslandController|data-publisle-static/u,
    );
  });

  it("renders static island fallback content in SSR before activation", async () => {
    const result = await fixture([
      {
        kind: "island",
        blockId: "island",
        activation: "interaction",
        label: "Example",
        module: "./Island.svelte",
        exportName: "default",
        props: {},
        fallback: [component("Available without JavaScript")],
      },
    ]);
    expect(result.markup).toContain("Available without JavaScript: 2 Hz");
    expect(result.markup).toContain("hidden");
    expect(result.emitted).toContain('import("./Island.svelte")');
  });

  it("fails the build for a missing static export instead of emitting an empty placeholder", async () => {
    await expect(
      fixture([component("Missing", "Unavailable")]),
    ).rejects.toThrow();
  });

  it("renders a directly registered default Svelte component", async () => {
    const result = await fixture([
      component("Direct", "default", "./Static.svelte"),
    ]);
    expect(result.markup).toContain("Direct: 2 Hz");
  });

  it("fails the build when the registered static module is unavailable", async () => {
    await expect(
      fixture([component("Missing", "default", "./Unavailable.svelte")]),
    ).rejects.toThrow();
  });
});
