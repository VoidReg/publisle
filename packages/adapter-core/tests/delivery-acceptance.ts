import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createBlock,
  document,
  parseInteractiveEnvelope,
  isJsonValue,
  type JsonValue,
} from "@publisle/schema";
import {
  coreBlockDefinitions,
  heading,
  paragraph,
} from "@publisle/blocks-core";
import { createRegistry, assertPrepared, prepare } from "@publisle/core";
import { createRenderPlan } from "../src/render-plan.ts";
import {
  compilePublication,
  instantiatePublication,
  publicationReaderManifest,
} from "../src/publication.ts";
import { nativeRenderingFixture } from "./native-rendering.ts";
import type { AdapterTarget } from "../src/types.ts";
import type { Plugin } from "vite";
import { javascriptValue } from "../src/javascript.ts";

export function runDeliveryAcceptance(options: {
  readonly target: AdapterTarget;
  readonly dependencyDirectory: string;
  readonly runtime: string;
  readonly islandModule: string;
  readonly files: Readonly<Record<string, string>>;
  readonly artifactMount: string;
  readonly plugins?: Plugin[];
}): void {
  const values: readonly JsonValue[] = [
    JSON.parse('{"sample":true,"__proto__":{"polluted":true}}') as JsonValue,
    [1, null, "x"],
    "text",
    42,
    false,
    null,
  ];
  const definition = {
    type: "acceptance:any-json" as const,
    schemaVersion: 1,
    schema: {
      parse: (value: unknown) =>
        parseInteractiveEnvelope(value, (payload) => {
          if (!isJsonValue(payload)) throw new Error("Invalid JSON.");
          return payload;
        }),
    },
    island: () => ({ activation: "load" as const }),
  };
  const input = document({
    blocks: [
      heading({
        level: 2,
        label: "example",
        content: [{ type: "text", value: "Repeated article" }],
      }),
      paragraph({ content: [{ type: "crossReference", target: "example" }] }),
      ...values.map((payload) =>
        createBlock({
          type: definition.type,
          data: {
            activation: "load",
            payload,
            initialState: null,
            fallback: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "Useful fallback" }],
              },
            ],
          },
        }),
      ),
    ],
  });
  const plan = createRenderPlan(
    assertPrepared(
      prepare(input, {
        registry: createRegistry([...coreBlockDefinitions, definition]),
      }),
    ),
    { renderers: { [definition.type]: { module: options.islandModule } } },
  );
  describe(`${options.target.name} native/artifact input and placement parity`, () => {
    let browser: Browser;
    beforeAll(async () => {
      const executablePath =
        process.env["PUBLISLE_BROWSER_PATH"] ??
        (!process.env["CI"] && existsSync("/usr/bin/google-chrome")
          ? "/usr/bin/google-chrome"
          : undefined);
      browser = await chromium.launch({
        ...(executablePath === undefined ? {} : { executablePath }),
        args: ["--no-sandbox"],
      });
    });
    afterAll(async () => {
      await browser?.close();
    });
    for (const mode of ["native", "artifact"] as const)
      it(`${mode} retains every JSON payload and independent repeated placements without reader tooling`, async () => {
        const artifact = compilePublication(plan);
        const artifactFiles = {
          "server.js": `export const markup=${JSON.stringify(instantiatePublication(artifact, "one").html + instantiatePublication(artifact, "two").html)};`,
          "client.js": `import {attachPublication} from ${JSON.stringify(fileURLToPath(new URL("../src/publication-runtime.ts", import.meta.url)))};${options.artifactMount}
const artifact=${javascriptValue(publicationReaderManifest(artifact))};window.__inputs=[];window.__moduleLoads=0;document.querySelectorAll("[data-publisle-root]").forEach(root=>attachPublication(root,artifact,{implementations:{"acceptance:any-json":()=>import(${JSON.stringify(options.islandModule)})},mount:hostMount,unmount:hostUnmount}));
window.__checkArtifactPolicy=(implementation)=>{const root=document.querySelector("[data-publisle-root]").cloneNode(true);root.querySelectorAll("[data-publisle-fallback]").forEach(node=>node.hidden=false);root.querySelectorAll("[data-publisle-mount]").forEach(node=>{node.hidden=true;node.replaceChildren()});const candidate=implementation===null?{...artifact,compatibility:{islandInputVersion:99}}:{...artifact,islands:artifact.islands.map(island=>({...island,implementation}))};const handle=attachPublication(root,candidate,{implementations:{},mount:hostMount,unmount:hostUnmount});const result={incompatible:root.hasAttribute("data-publisle-incompatible"),missing:root.querySelectorAll("[data-publisle-missing]").length,fallbacksVisible:[...root.querySelectorAll("[data-publisle-fallback]")].every(node=>!node.hidden)};handle.dispose();return result};`,
        };
        await nativeRenderingFixture({
          target: options.target,
          nodes: plan.nodes,
          plan,
          dependencyDirectory: options.dependencyDirectory,
          runtime: options.runtime,
          files:
            mode === "native"
              ? options.files
              : { ...options.files, ...artifactFiles },
          ...(options.plugins === undefined
            ? {}
            : { plugins: options.plugins }),
          minify: true,
          browser: async (result) => {
            expect(
              result.modules.filter((id) =>
                /\/packages\/(?:schema|core|contracts|markdown|block-sdk)\/|\/blocks\/(?:core|technical)\/|\/node_modules\/(?:\.pnpm\/)?ajv(?:@|\/)/u.test(
                  id,
                ),
              ),
            ).toEqual([]);
            const page = await browser.newPage();
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            try {
              await page.goto(result.url);
              await page.waitForFunction(
                () =>
                  (window as unknown as { __inputs: unknown[] }).__inputs
                    ?.length === 12,
              );
              // Browser automation's object transport has its own prototype-key semantics.
              const received = JSON.parse(
                await page.evaluate(() =>
                  JSON.stringify(
                    (window as unknown as { __inputs: unknown[] }).__inputs,
                  ),
                ),
              ) as {
                payload: JsonValue;
                inputVersion: number;
                block: { id: string };
              }[];
              for (const [index, block] of input.blocks.slice(2).entries()) {
                expect(
                  received
                    .filter((entry) => entry.block.id === block.id)
                    .map((entry) => entry.payload),
                ).toEqual([values[index], values[index]]);
              }
              expect(
                received.every(
                  (entry) =>
                    entry.inputVersion === 1 &&
                    typeof entry.block.id === "string",
                ),
              ).toBe(true);
              expect(await page.locator("[data-payload]").count()).toBe(12);
              const ids = await page
                .locator("h2")
                .evaluateAll((elements) =>
                  elements.map((element) => element.id),
                );
              expect(ids).toEqual([
                "one-reference-example",
                "two-reference-example",
              ]);
              const refs = await page
                .locator('a[href*="reference-example"]')
                .evaluateAll((elements) =>
                  elements.map((element) => element.getAttribute("href")),
                );
              expect(refs).toEqual([
                "#one-reference-example",
                "#two-reference-example",
              ]);
              await page.locator("[data-state]").first().click();
              expect(
                await page.locator("[data-state]").first().textContent(),
              ).toBe("State 1");
              expect(
                await page.locator("[data-state]").nth(6).textContent(),
              ).toBe("State 0");
              expect(
                await page.evaluate(
                  () =>
                    (window as unknown as { __moduleLoads: number })
                      .__moduleLoads,
                ),
              ).toBe(1);
              expect(errors).toEqual([]);
              if (mode === "artifact") {
                for (const implementation of [
                  "https://evil.test/execute.js",
                  "toString",
                  null,
                ]) {
                  const policy = await page.evaluate(
                    (value) =>
                      (
                        window as unknown as {
                          __checkArtifactPolicy: (
                            implementation: string | null,
                          ) => {
                            incompatible: boolean;
                            missing: number;
                            fallbacksVisible: boolean;
                          };
                        }
                      ).__checkArtifactPolicy(value),
                    implementation,
                  );
                  expect(policy).toEqual({
                    incompatible: implementation === null,
                    missing: implementation === null ? 0 : 6,
                    fallbacksVisible: true,
                  });
                }
                expect(
                  await page.evaluate(
                    () =>
                      (window as unknown as { __moduleLoads: number })
                        .__moduleLoads,
                  ),
                ).toBe(1);
              }
            } finally {
              await page.close();
            }
          },
        });
      });
  });
}
