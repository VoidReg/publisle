import { existsSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { coreBlockDefinitions, paragraph, figure } from "@publisle/blocks-core";
import {
  createRegistry,
  prepare,
  assertPrepared,
  getBlockSourceDigest,
} from "@publisle/core";
import {
  createBlock,
  document,
  isInteractiveEnvelope,
  isPlainObject,
  type Activation,
  type JsonObject,
} from "@publisle/schema";
import { accessibilityProfile } from "../../profiles/src/index.ts";
import { createRenderPlan } from "../src/render-plan.ts";
import {
  nativeRenderingFixture,
  type NativeFixtureResult,
} from "./native-rendering.ts";

type FixtureOptions = Parameters<typeof nativeRenderingFixture>[0];
interface AcceptanceOptions extends Omit<
  FixtureOptions,
  "nodes" | "plan" | "browser"
> {
  islandModule: string;
}

const forbiddenTooling =
  /\/(?:packages\/(?:schema|core|markdown|block-sdk|profiles|contracts)|blocks\/(?:core|technical)|examples\/playground-core)\/|\/node_modules\/(?:\.pnpm\/)?ajv(?:@|\/)/u;
const state = () => ({
  ready: false,
  moduleLoads: 0,
  mounted: [] as string[],
  cleaned: [] as string[],
  route: "host-route",
  globalState: "host-state",
  metadata: null,
});
const payloadSchema = {
  parse(value: unknown) {
    if (
      !isInteractiveEnvelope(value) ||
      !isPlainObject(value.payload) ||
      typeof value.payload["name"] !== "string" ||
      typeof value.payload["start"] !== "number"
    )
      throw new Error("Invalid acceptance island payload.");
    return { ...value, payload: value.payload as JsonObject };
  },
};
const definition = {
  type: "acceptance:counter" as const,
  schemaVersion: 1,
  schema: payloadSchema,
  island: (value: ReturnType<typeof payloadSchema.parse>) => ({
    activation: value.activation,
  }),
  resources: (value: ReturnType<typeof payloadSchema.parse>) => [
    {
      uri: String(value.payload["source"]),
      transform: "snapshot@1",
      options: { variant: String(value.payload["name"]) },
    },
  ],
};
const registry = createRegistry([
  ...coreBlockDefinitions,
  definition,
  { ...definition, type: "acceptance:unrelated" },
]);
const text = (value: string) => [{ type: "text" as const, value }];

function planFor(
  options: AcceptanceOptions,
  intents: readonly { name: string; activation: Activation; start?: number }[],
) {
  const input = document({
    metadata: { title: "Authored Title" },
    blocks: [
      paragraph({ content: text("Readable article text.") }),
      ...intents.map(({ name, activation, start = 0 }) =>
        createBlock({
          type: definition.type,
          data: {
            activation,
            accessibility: { label: name },
            fallback: [
              { type: "paragraph", content: text(`Fallback for ${name}.`) },
            ],
            payload: { name, start, source: "./shared.json" },
          },
        }),
      ),
    ],
  });
  const result = prepare(input, {
    registry,
    profiles: [accessibilityProfile()],
    resourceResolver: {
      version: "fixture@1",
      resolve: () => ({ version: "shared-content@1" }),
    },
  });
  expect(result.diagnostics).toEqual([]);
  const prepared = assertPrepared(result);
  if (intents.length) {
    expect(prepared.resources.resources).toHaveLength(1);
    expect(prepared.resources.artifacts).toHaveLength(intents.length);
    expect(
      new Set(
        prepared.resources.artifacts!.map(
          ({ sourceIdentity }) => sourceIdentity,
        ),
      ).size,
    ).toBe(1);
    expect(
      new Set(prepared.resources.artifacts!.map(({ identity }) => identity))
        .size,
    ).toBe(intents.length);
  }
  const plan = createRenderPlan(prepared, {
    renderers: {
      [definition.type]: { interactive: { module: options.islandModule } },
      "acceptance:unrelated": {
        interactive: { module: `./Unrelated.${options.target.extension}` },
      },
    },
  });
  expect(plan.diagnostics).toEqual([]);
  return plan;
}

async function installSchedulers(page: Page) {
  await page.addInitScript((initial) => {
    const host = window as unknown as {
      __acceptance: typeof initial;
      __schedulers: {
        visible: (label: string) => void;
        idle: () => void;
        pending: () => { observers: number; idle: number };
      };
    };
    host.__acceptance = initial;
    const observers = new Map<HTMLElement, IntersectionObserverCallback>();
    const idleCallbacks = new Map<number, IdleRequestCallback>();
    let nextIdle = 0;
    window.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly scrollMargin = "0px";
      readonly thresholds = [0];
      private targets = new Set<HTMLElement>();
      private callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.targets.add(target as HTMLElement);
        observers.set(target as HTMLElement, this.callback);
      }
      unobserve(target: Element) {
        this.targets.delete(target as HTMLElement);
        observers.delete(target as HTMLElement);
      }
      disconnect() {
        for (const target of this.targets) observers.delete(target);
        this.targets.clear();
      }
      takeRecords() {
        return [];
      }
    };
    window.requestIdleCallback = (callback) => {
      const id = ++nextIdle;
      idleCallbacks.set(id, callback);
      return id;
    };
    window.cancelIdleCallback = (id) => {
      idleCallbacks.delete(id);
    };
    host.__schedulers = {
      visible(label) {
        for (const [target, callback] of [...observers])
          if (
            target.closest(".publisle-island")?.getAttribute("aria-label") ===
            label
          )
            callback(
              [
                {
                  isIntersecting: true,
                  target,
                } as unknown as IntersectionObserverEntry,
              ],
              {} as IntersectionObserver,
            );
      },
      idle() {
        const first = idleCallbacks.entries().next().value;
        if (first) {
          const [id, callback] = first;
          idleCallbacks.delete(id);
          callback({ didTimeout: false, timeRemaining: () => 50 });
        }
      },
      pending: () => ({ observers: observers.size, idle: idleCallbacks.size }),
    };
  }, state());
}

async function ready(page: Page, url: string) {
  await installSchedulers(page);
  await page.goto(url);
  await page.waitForFunction("window.__acceptance.ready");
}

async function unchangedHost(page: Page, head: string) {
  expect(await page.title()).toBe("Host Title");
  expect(await page.locator("head").innerHTML()).toBe(head);
  expect(await page.evaluate<string>("window.__acceptance.route")).toBe(
    "host-route",
  );
  expect(await page.evaluate<string>("window.__acceptance.globalState")).toBe(
    "host-state",
  );
  expect(await page.getByText("Host before", { exact: true }).count()).toBe(1);
  expect(await page.getByText("Host after", { exact: true }).count()).toBe(1);
  expect(
    await page
      .getByRole("button", { name: "Host count 1", exact: true })
      .count(),
  ).toBe(1);
}

function assertBundle(
  result: NativeFixtureResult,
  adapter: string,
  islandModule?: string,
) {
  console.info(
    `[acceptance:${adapter}:${islandModule ? "islands" : "static"}] ${JSON.stringify(result.accounting)}`,
  );
  expect(result.modules.filter((id) => forbiddenTooling.test(id))).toEqual([]);
  expect(result.code).not.toMatch(
    /SchemaParseError|parseDocument|migrateDocument|treeToDocument|DocumentEditor/u,
  );
  expect(result.code).not.toContain("UNRELATED_IMPLEMENTATION_SENTINEL");
  expect(result.modules.some((id) => id.includes("Unrelated"))).toBe(false);
  expect(result.accounting.bundledBytes).toBeGreaterThan(0);
  expect(result.accounting.gzipBytes).toBeGreaterThan(0);
  expect(result.accounting.frameworkRenderedBytes).toBeGreaterThan(0);
  if (islandModule) {
    const reachable = result.modules.filter((id) =>
      id.endsWith(islandModule.slice(1)),
    );
    expect(reachable).toHaveLength(1);
    expect(result.accounting.publisleRenderedBytes).toBeGreaterThan(0);
    expect(
      result.modules
        .filter((id) => id.includes("/packages/adapter-"))
        .every(
          (id) =>
            id.endsWith("/runtime.ts") || id.endsWith("/island-runtime.ts"),
        ),
    ).toBe(true);
  } else {
    expect(result.modules.some((id) => id.includes("/packages/adapter-"))).toBe(
      false,
    );
    expect(result.accounting.publisleRenderedBytes).toBe(0);
    expect(result.code).not.toMatch(
      /createIslandController|PublisleIsland|publisle:prepared-document/u,
    );
  }
}

export function runAdapterAcceptance(options: AcceptanceOptions) {
  describe(`${options.target.name} production acceptance`, () => {
    let browser: Browser;
    beforeAll(async () => {
      const executablePath =
        process.env["PUBLISLE_BROWSER_PATH"] ??
        (!process.env["CI"] && existsSync("/usr/bin/google-chrome")
          ? "/usr/bin/google-chrome"
          : undefined);
      browser = await chromium.launch({
        ...(executablePath === undefined ? {} : { executablePath }),
        headless: true,
        args: ["--no-sandbox"],
      });
    });
    afterAll(async () => {
      await browser?.close();
    });
    const fixture = (
      intents: Parameters<typeof planFor>[1],
      callback: FixtureOptions["browser"],
      change?: (plan: ReturnType<typeof planFor>) => void,
    ) => {
      const plan = planFor(options, intents);
      change?.(plan);
      return nativeRenderingFixture({
        ...options,
        nodes: plan.nodes,
        plan,
        minify: true,
        ...(callback === undefined ? {} : { browser: callback }),
      });
    };

    it("builds static-only content without Publisle runtime/tooling or client document traversal and coexists with host components", async () => {
      const result = await fixture([], async ({ url }) => {
        const page = await browser.newPage();
        try {
          await ready(page, url);
          const head = await page.locator("head").innerHTML();
          expect(
            await page.evaluate<JsonObject>("window.__acceptance.metadata"),
          ).toEqual({ title: "Authored Title" });
          expect(
            await page
              .getByText("Readable article text.", { exact: true })
              .count(),
          ).toBe(1);
          await page
            .getByRole("button", { name: "Host count 0", exact: true })
            .click();
          await page.waitForFunction(
            "document.body.textContent.includes('Host count 1')",
          );
          await page.evaluate("window.__acceptance.removeArticle()");
          await page.waitForFunction(
            "!document.body.textContent.includes('Readable article text.')",
          );
          await unchangedHost(page, head);
        } finally {
          await page.close();
        }
      });
      assertBundle(result, options.target.name);
    });

    it("renders digest-associated unknown content without JavaScript, contracts or a renderer", async () => {
      const block = createBlock({
        type: "future:canvas",
        data: { opaque: [1, 2, 3] },
      });
      const prepared = assertPrepared(
        prepare(
          document({
            blocks: [
              {
                ...block,
                readable: {
                  sourceDigest: getBlockSourceDigest(block),
                  provenance: { kind: "authored" },
                  content: {
                    fallback: [
                      {
                        type: "paragraph",
                        content: text("Authored unknown-canvas fallback."),
                      },
                    ],
                  },
                },
              },
            ],
          }),
          { registry: createRegistry([]) },
        ),
      );
      const plan = createRenderPlan(prepared);
      expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "missing-renderer",
      ]);
      const result = await nativeRenderingFixture({
        ...options,
        nodes: plan.nodes,
        plan,
        minify: true,
        browser: async ({ url }) => {
          const context = await browser.newContext({
            javaScriptEnabled: false,
          });
          try {
            const page = await context.newPage();
            await page.goto(url);
            expect(
              await page
                .getByText("Authored unknown-canvas fallback.", { exact: true })
                .isVisible(),
            ).toBe(true);
            expect(
              await page
                .locator("[data-publisle-unknown-block='future:canvas']")
                .count(),
            ).toBe(1);
          } finally {
            await context.close();
          }
        },
      });
      assertBundle(result, options.target.name);
    });

    it("activates every intent, shares one module with independent state, retains no-JS fallbacks, and cleans up natively", async () => {
      const intents = [
        { name: "Load", activation: "load" as const },
        { name: "Visible", activation: "visible" as const },
        { name: "Idle", activation: "idle" as const },
        { name: "First", activation: "interaction" as const, start: 1 },
        { name: "Second", activation: "interaction" as const, start: 10 },
        { name: "Cancelled visible", activation: "visible" as const },
        { name: "Cancelled idle", activation: "idle" as const },
      ];
      const result = await fixture(intents, async ({ url, chunks }) => {
        const noJs = await browser.newContext({ javaScriptEnabled: false });
        try {
          const page = await noJs.newPage();
          await page.goto(url);
          for (const { name } of intents)
            expect(
              await page
                .getByText(`Fallback for ${name}.`, { exact: true })
                .isVisible(),
            ).toBe(true);
          expect(await page.locator("[data-counter]").count()).toBe(0);
        } finally {
          await noJs.close();
        }
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const moduleRequests: string[] = [];
        const islandChunk = chunks.find((chunk) =>
          chunk.modules.some((id) =>
            id.endsWith(options.islandModule.slice(1)),
          ),
        )!;
        page.on("request", (request) => {
          if (new URL(request.url()).pathname === `/${islandChunk.fileName}`)
            moduleRequests.push(request.url());
        });
        try {
          await ready(page, url);
          const head = await page.locator("head").innerHTML();
          await page.waitForFunction(
            "window.__acceptance.mounted.includes('Load')",
          );
          expect(
            await page.evaluate<string[]>("window.__acceptance.mounted"),
          ).toEqual(["Load"]);
          await page.evaluate(
            "window.__schedulers.visible('Visible'); window.__schedulers.idle()",
          );
          await page.waitForFunction(
            "window.__acceptance.mounted.includes('Visible') && window.__acceptance.mounted.includes('Idle')",
          );
          await page
            .locator('[aria-label="First"] [data-publisle-activate]')
            .click();
          await page
            .locator('[aria-label="Second"] [data-publisle-activate]')
            .click();
          await page.waitForFunction(
            "window.__acceptance.mounted.length === 5",
          );
          await page
            .getByRole("button", { name: "First count 1", exact: true })
            .click();
          expect(
            await page
              .getByRole("button", { name: "First count 2", exact: true })
              .count(),
          ).toBe(1);
          expect(
            await page
              .getByRole("button", { name: "Second count 10", exact: true })
              .count(),
          ).toBe(1);
          expect(
            await page.evaluate<number>("window.__acceptance.moduleLoads"),
          ).toBe(1);
          expect(moduleRequests).toHaveLength(1);
          expect(
            await page
              .getByText("Fallback for First.", { exact: true })
              .isVisible(),
          ).toBe(false);
          await page
            .getByRole("button", { name: "Host count 0", exact: true })
            .click();
          await page.waitForFunction(
            "document.body.textContent.includes('Host count 1')",
          );
          expect(
            await page
              .getByRole("button", { name: "First count 2", exact: true })
              .count(),
          ).toBe(1);
          expect(
            await page
              .getByRole("button", { name: "Second count 10", exact: true })
              .count(),
          ).toBe(1);
          expect(
            await page.evaluate<string[]>("window.__acceptance.cleaned"),
          ).toEqual([]);
          expect(
            await page.evaluate<string[]>("window.__acceptance.mounted"),
          ).toHaveLength(5);
          await page.evaluate("window.__acceptance.removeArticle()");
          await page.waitForFunction(
            "window.__acceptance.cleaned.length === 5",
          );
          expect(
            (
              await page.evaluate<string[]>("window.__acceptance.cleaned")
            ).sort(),
          ).toEqual(["First", "Idle", "Load", "Second", "Visible"].sort());
          expect(
            await page.evaluate<{ observers: number; idle: number }>(
              "window.__schedulers.pending()",
            ),
          ).toEqual({ observers: 0, idle: 0 });
          await unchangedHost(page, head);
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      });
      assertBundle(result, options.target.name, options.islandModule);
    });

    it("keeps a one-island fallback readable on load and missing-export failures without importing unrelated implementations", async () => {
      const result = await fixture(
        [{ name: "Failure", activation: "interaction" }],
        async ({ url, chunks }) => {
          const islandChunk = chunks.find((chunk) =>
            chunk.modules.some((id) =>
              id.endsWith(options.islandModule.slice(1)),
            ),
          )!;
          for (const blockLoad of [true, false]) {
            const page = await browser.newPage();
            try {
              if (blockLoad)
                await page.route(`**/${islandChunk.fileName}`, (route) =>
                  route.abort(),
                );
              await ready(page, url);
              await page.locator("[data-publisle-activate]").click();
              if (!blockLoad)
                await page.waitForFunction(
                  "window.__acceptance.moduleLoads === 1",
                );
              // Round-trip through the browser task queue after the caught activation failure.
              await page.evaluate(
                "new Promise(resolve => setTimeout(resolve, 0))",
              );
              expect(
                await page
                  .getByText("Fallback for Failure.", { exact: true })
                  .isVisible(),
              ).toBe(true);
              expect(
                await page.evaluate<string[]>("window.__acceptance.mounted"),
              ).toEqual([]);
            } finally {
              await page.close();
            }
          }
        },
        (plan) => {
          const replace = (nodes: typeof plan.nodes): typeof plan.nodes =>
            nodes.map((node) =>
              node.kind === "island"
                ? { ...node, exportName: "Missing" }
                : node.kind === "element"
                  ? { ...node, children: replace(node.children) }
                  : node,
            );
          Object.assign(plan, { nodes: replace(plan.nodes) });
        },
      );
      assertBundle(result, options.target.name, options.islandModule);
    });

    it("does not mount after host removal while module loading is pending", async () => {
      await fixture(
        [{ name: "Pending", activation: "interaction" }],
        async ({ url, chunks }) => {
          const page = await browser.newPage();
          const islandChunk = chunks.find((chunk) =>
            chunk.modules.some((id) =>
              id.endsWith(options.islandModule.slice(1)),
            ),
          )!;
          let release: () => void = () => undefined;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          let intercepted: () => void = () => undefined;
          const requested = new Promise<void>((resolve) => {
            intercepted = resolve;
          });
          try {
            await page.route(`**/${islandChunk.fileName}`, async (route) => {
              intercepted();
              await gate;
              await route.continue();
            });
            await ready(page, url);
            await page.locator("[data-publisle-activate]").click();
            await requested;
            await page.evaluate("window.__acceptance.removeArticle()");
            await page.waitForFunction(
              "document.querySelectorAll('.publisle-island').length === 0",
            );
            release();
            await page.waitForFunction("window.__acceptance.moduleLoads === 1");
            expect(
              await page.evaluate<string[]>("window.__acceptance.mounted"),
            ).toEqual([]);
            expect(
              await page.evaluate<string[]>("window.__acceptance.cleaned"),
            ).toEqual([]);
          } finally {
            release();
            await page.close();
          }
        },
      );
    });

    it("distinguishes optional profile errors from structural invalidity before compiling either adapter", () => {
      const input = document({ blocks: [figure({ src: "figure.svg" })] });
      expect(
        prepare(input, { registry, profiles: [accessibilityProfile()] })
          .document,
      ).toBeDefined();
      expect(
        prepare(input, {
          registry,
          profiles: [accessibilityProfile()],
          diagnosticPolicy: { "missing-alternative-text": "error" },
        }).document,
      ).toBeUndefined();
      const invalid = document({
        blocks: [createBlock({ type: definition.type, data: { payload: {} } })],
      });
      const result = prepare(invalid, {
        registry,
        diagnosticPolicy: { "invalid-block-data": "info" },
      });
      expect(result.document).toBeUndefined();
      expect(result.diagnostics[0]).toMatchObject({
        code: "invalid-block-data",
        level: "error",
      });
    });
  });
}
