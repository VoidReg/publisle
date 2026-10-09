/** Production fixture shared by browser acceptance and reader measurements. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "svelte/compiler";
import {
  coreBlockDefinitions,
  paragraph,
} from "../../blocks/core/src/index.ts";
import { createBlock, document } from "../../packages/schema/src/index.ts";
import {
  createRegistry,
  assertPrepared,
  prepare,
} from "../../packages/core/src/index.ts";
import { createRenderPlan } from "../../packages/adapter-core/src/render-plan.ts";
import {
  compilePublication,
  instantiatePublication,
  publicationReaderManifest,
} from "../../packages/adapter-core/src/publication.ts";
import { javascriptValue } from "../../packages/adapter-core/src/javascript.ts";
import { reactTarget } from "../../packages/adapter-react/src/emitter.ts";
import { svelteTarget } from "../../packages/adapter-svelte/src/emitter.ts";
import {
  defaultFourier,
  fourierDefinition,
} from "../../examples/fourier-demo/src/definition.ts";
import {
  nativeRenderingFixture,
  type NativeFixtureResult,
} from "../../packages/adapter-core/tests/native-rendering.ts";

const absolute = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));
const stylesheet = readFileSync(
  new URL("../../packages/adapter-core/src/document.css", import.meta.url),
  "utf8",
);

export async function fourierHost(options: {
  framework: "react" | "svelte";
  mode: "native" | "artifact";
  islands?: number;
  browser: (
    fixture: NativeFixtureResult & { url: string; propsBytes: number },
  ) => Promise<void>;
}): Promise<void> {
  const { framework, mode } = options;
  const target = framework === "react" ? reactTarget : svelteTarget;
  const islandModule = `./Island.${target.extension}`;
  const prepared = assertPrepared(
    prepare(
      document({
        blocks: [
          paragraph({
            content: [
              {
                type: "text",
                value:
                  "Odd harmonics approximate a square wave. The finite series is evaluated by the host.",
              },
            ],
          }),
          ...Array.from({ length: options.islands ?? 1 }, () =>
            createBlock({
              type: fourierDefinition.type,
              data: defaultFourier(),
            }),
          ),
        ],
      }),
      {
        registry: createRegistry([...coreBlockDefinitions, fourierDefinition]),
      },
    ),
  );
  const plan = createRenderPlan(prepared, {
    renderers: { [fourierDefinition.type]: { module: islandModule } },
  });
  const artifact = compilePublication(plan);
  const implementation = absolute(
    `../../examples/fourier-demo/src/PartialSum.${framework === "react" ? "tsx" : "svelte"}`,
  );
  const mount =
    framework === "react"
      ? 'import {createRoot} from "react-dom/client";import {createElement as h} from "react";const hostMount=(module,target,props)=>{const root=createRoot(target);root.render(h(module.default,props));return root;};const hostUnmount=root=>root.unmount();'
      : 'import {mount,unmount} from "svelte";const hostMount=(module,target,props)=>mount(module.default,{target,props});const hostUnmount=instance=>unmount(instance);';
  const files: Record<string, string> =
    framework === "react"
      ? {
          "Host.jsx":
            'import {createElement as h} from "react";import Document from "./Document.jsx";export default function Host(){return h("div",{className:"publisle-document"},h(Document,{instanceId:"one"}),h(Document,{instanceId:"two"}));}',
          "Island.jsx": `export {default} from ${JSON.stringify(implementation)};`,
          "server.js":
            'import Host from "./Host.jsx";import {createElement} from "react";import {renderToString} from "react-dom/server";export const markup=renderToString(createElement(Host));',
          "client.js":
            'import Host from "./Host.jsx";import {hydrateRoot} from "react-dom/client";import {createElement} from "react";hydrateRoot(document.getElementById("app"),createElement(Host));',
        }
      : {
          "Host.svelte":
            '<script>import Document from "./Document.svelte";</script><div class="publisle-document"><Document instanceId="one"/><Document instanceId="two"/></div>',
          "Island.svelte": `<script>import PartialSum from ${JSON.stringify(implementation)};let input=$props();</script><PartialSum {...input}/>`,
          "server.js":
            'import Host from "./Host.svelte";import {render} from "svelte/server";export const markup=render(Host).body;',
          "client.js":
            'import Host from "./Host.svelte";import {hydrate} from "svelte";hydrate(Host,{target:document.getElementById("app")});',
        };
  if (mode === "artifact") {
    files["server.js"] =
      `export const markup=${JSON.stringify(instantiatePublication(artifact, "one").html + instantiatePublication(artifact, "two").html)};`;
    files["client.js"] =
      `import {attachPublication} from ${JSON.stringify(absolute("../../packages/adapter-core/src/publication-runtime.ts"))};${mount}
const manifest=${javascriptValue(publicationReaderManifest(artifact))};document.querySelectorAll("[data-publisle-root]").forEach(root=>attachPublication(root,manifest,{implementations:{"demo:fourier-partial-sum":()=>import(${JSON.stringify(islandModule)})},mount:hostMount,unmount:hostUnmount}));`;
  }
  files["client.js"] =
    (files["client.js"] ?? "") +
    "\nrequestAnimationFrame(()=>requestAnimationFrame(()=>window.__fixtureReady=true));";
  // Host-owned CSS is deliberately included in the actual delivered markup.
  files["server.js"] =
    (files["server.js"] ?? "") +
    `\nconst css=${JSON.stringify(`<style>${stylesheet}</style>`)};export {css};`;
  await nativeRenderingFixture({
    target,
    nodes: plan.nodes,
    plan,
    dependencyDirectory: absolute(
      `../../packages/adapter-${framework}/node_modules`,
    ),
    runtime: absolute(`../../packages/adapter-${framework}/src/runtime.ts`),
    files,
    minify: true,
    ...(framework === "svelte"
      ? {
          plugins: [
            {
              name: "fourier-svelte",
              transform(
                source: string,
                id: string,
                transformOptions?: { ssr?: boolean | undefined },
              ) {
                if (!id.endsWith(".svelte")) return undefined;
                return compile(source, {
                  filename: id,
                  generate: transformOptions?.ssr ? "server" : "client",
                  css: "external",
                }).js;
              },
            },
          ],
        }
      : {}),
    browser: (fixture) =>
      options.browser({
        ...fixture,
        propsBytes:
          Buffer.byteLength(
            JSON.stringify(artifact.islands.map((island) => island.props)),
          ) * 2,
      }),
  });
}
