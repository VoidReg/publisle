import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { build } from "vite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const runtimeUrl = fileURLToPath(
  new URL("../src/island-runtime.ts", import.meta.url),
);
const stylesheet = readFileSync(
  new URL("../src/document.css", import.meta.url),
  "utf8",
);
const host = `
import { createIslandController } from ${JSON.stringify(runtimeUrl)};
const records = {};
for (const section of document.querySelectorAll("[data-publisle-island]")) {
  const id = section.getAttribute("data-publisle-island");
  const root = section.querySelector("[data-publisle-mount]");
  const fallback = section.querySelector("[data-publisle-fallback]");
  let mounts = 0;
  let unmounts = 0;
  const controller = createIslandController({
    root,
    fallback,
    scope: section,
    activation: section.dataset.activation || "interaction",
    suspend: section.dataset.suspend === "true",
    props: {},
    load: (signal) => new Promise((resolve, reject) => {
      const delay = Number(section.dataset.delay || 0);
      const timer = setTimeout(() => {
        if (section.dataset.fail === "true") reject(new Error("Island failed"));
        else resolve({ ok: true });
      }, delay);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    }),
    mount: (_module, target) => {
      mounts += 1;
      target.replaceChildren(document.createTextNode("Mounted partial sums " + id));
      return mounts;
    },
    unmount: () => {
      unmounts += 1;
    },
  });
  records[id] = {
    mounts: () => mounts,
    unmounts: () => unmounts,
    destroy: () => controller.destroy(),
    activate: () => controller.activate(),
  };
}
window.__publisleLifecycle = records;
`;

function article(islands: string): string {
  return `<!doctype html><html><head><style>${stylesheet}</style></head><body><div class="publisle-document"><section class="publisle-interactive"><p>Odd harmonics approximate a square wave.</p>${islands}</section></div></body></html>`;
}

function island(id: string, attributes = ""): string {
  return `<section data-publisle-island="${id}" aria-label="Partial sums ${id}" data-publisle-contract="urn:publisle:contract:sha256:aa sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ${attributes}><div data-publisle-fallback><p>Three odd harmonics already show the square-wave steps.</p></div><div data-publisle-mount hidden></div><button type="button" data-publisle-activate>Explore partial sums</button></section>`;
}

async function bundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "lifecycle-host",
        resolveId: (id) =>
          id === "lifecycle-host" ? "\0lifecycle-host" : undefined,
        load: (id) => (id === "\0lifecycle-host" ? host : undefined),
      },
    ],
    build: {
      write: false,
      minify: true,
      rollupOptions: { input: "lifecycle-host" },
    },
  });
  const built = Array.isArray(result) ? result[0] : result;
  if (!built || !("output" in built))
    throw new Error("Expected lifecycle bundle");
  const chunk = built.output.find(
    (item) => item.type === "chunk" && item.isEntry,
  );
  if (chunk?.type !== "chunk") throw new Error("Missing lifecycle entry");
  return chunk.code;
}

function mounts(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (islandId) =>
      (
        window as unknown as {
          __publisleLifecycle: Record<string, { mounts(): number }>;
        }
      ).__publisleLifecycle[islandId]?.mounts() ?? -1,
    id,
  );
}

async function open(page: Page, html: string, code: string): Promise<void> {
  await page.setContent(html);
  await page.addScriptTag({ content: code, type: "module" });
}

describe("interactive publication lifecycle", () => {
  let browser: Browser;
  let code: string;
  beforeAll(async () => {
    code = await bundle();
    expect(code).not.toMatch(/ajv|packages\/schema|packages\/contracts/u);
    const executablePath =
      process.env["PUBLISLE_BROWSER_PATH"] ??
      (!process.env["CI"] && existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined);
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"],
    });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("activates from the keyboard, preserves focus, and ignores a second mount", async () => {
    const page = await browser.newPage();
    await open(page, article(`${island("first")} ${island("second")}`), code);
    const first = page.locator("[data-publisle-island='first']");
    const button = first.locator("[data-publisle-activate]");
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector(
          "[data-publisle-island='first'] [data-publisle-mount]",
        )?.textContent === "Mounted partial sums first",
    );
    expect(await first.locator("[data-publisle-fallback]").isHidden()).toBe(
      true,
    );
    expect(await first.getAttribute("data-publisle-status")).toBe("ready");
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-publisle-mount") !== null,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      void (
        window as unknown as {
          __publisleLifecycle: Record<string, { activate(): Promise<void> }>;
        }
      ).__publisleLifecycle["first"]?.activate();
    });
    expect(await mounts(page, "first")).toBe(1);
    const second = page.locator(
      "[data-publisle-island='second'] [data-publisle-activate]",
    );
    await second.focus();
    await page.keyboard.press(" ");
    await page.waitForFunction(
      () =>
        document.querySelector(
          "[data-publisle-island='second'] [data-publisle-mount]",
        )?.textContent === "Mounted partial sums second",
    );
    expect(await mounts(page, "first")).toBe(1);
    await page.close();
  });

  it("discards a pending load when the island is destroyed", async () => {
    const page = await browser.newPage();
    await open(page, article(island("late", 'data-delay="250"')), code);
    await page.evaluate(() => {
      void (
        window as unknown as {
          __publisleLifecycle: Record<string, { activate(): Promise<void> }>;
        }
      ).__publisleLifecycle["late"]?.activate();
    });
    await page.evaluate(() => {
      (
        window as unknown as {
          __publisleLifecycle: Record<string, { destroy(): void }>;
        }
      ).__publisleLifecycle["late"]?.destroy();
    });
    await page.waitForTimeout(400);
    expect(await mounts(page, "late")).toBe(0);
    expect(await page.locator("[data-publisle-mount]").textContent()).toBe("");
    expect(await page.getByText("square-wave steps").isVisible()).toBe(true);
    await page.close();
  });

  it("keeps fallback and focus when activation fails", async () => {
    const page = await browser.newPage();
    await open(page, article(island("broken", 'data-fail="true"')), code);
    const button = page.locator("[data-publisle-activate]");
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-publisle-island]")
          ?.getAttribute("data-publisle-status") === "failed",
    );
    expect(await page.getByText("square-wave steps").isVisible()).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.hasAttribute("data-publisle-activate") ===
          true,
      ),
    ).toBe(true);
    await page
      .locator("[data-publisle-island]")
      .evaluate((node) => node.setAttribute("data-fail", "false"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-publisle-island]")
          ?.getAttribute("data-publisle-status") === "ready",
    );
    expect(await mounts(page, "broken")).toBe(1);
    await page.close();
  });

  it("cancels pending viewport loads, remounts after suspension and cleans up once", async () => {
    const page = await browser.newPage({
      viewport: { width: 800, height: 400 },
    });
    try {
      await open(
        page,
        article(
          island(
            "viewport",
            'data-activation="visible" data-suspend="true" data-delay="250"',
          ) + '<div style="height:3000px"></div>',
        ),
        code,
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-publisle-island]")
            ?.getAttribute("aria-busy") === "true",
      );
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-publisle-island]")
            ?.getAttribute("aria-busy") === "false",
      );
      await page.waitForTimeout(300);
      expect(await mounts(page, "viewport")).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-publisle-island]")
            ?.getAttribute("data-publisle-status") === "ready",
      );
      expect(await mounts(page, "viewport")).toBe(1);
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLElement>("[data-publisle-fallback]")
            ?.hidden,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(
        () =>
          document.querySelector("[data-publisle-mount]")?.textContent ===
            "Mounted partial sums viewport" &&
          !document.querySelector<HTMLElement>("[data-publisle-mount]")?.hidden,
      );
      expect(await mounts(page, "viewport")).toBe(2);
      const unmounts = await page.evaluate(() => {
        const record = (
          window as unknown as {
            __publisleLifecycle: Record<
              string,
              { destroy(): void; unmounts(): number }
            >;
          }
        ).__publisleLifecycle["viewport"];
        record?.destroy();
        record?.destroy();
        return record?.unmounts();
      });
      expect(unmounts).toBe(2);
    } finally {
      await page.close();
    }
  });

  it("keeps the authored explanation in print and without JavaScript", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setContent(article(island("static")));
    expect(await page.getByText("Odd harmonics approximate").isVisible()).toBe(
      true,
    );
    expect(await page.getByText("square-wave steps").isVisible()).toBe(true);
    expect(
      await page
        .locator("[data-publisle-contract]")
        .getAttribute("data-publisle-contract"),
    ).toMatch(/sha256:/u);
    expect(await page.getByText("Enable JavaScript").count()).toBe(0);
    await page.emulateMedia({ media: "print" });
    expect(await page.locator("[data-publisle-fallback]").isVisible()).toBe(
      true,
    );
    expect(
      await page
        .locator("[data-publisle-activate]")
        .evaluate((node) => getComputedStyle(node).display),
    ).toBe("none");
    await context.close();
  });

  it("respects reduced motion while activating an idle island", async () => {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, article(island("idle", 'data-activation="idle"')), code);
    await page.waitForFunction(
      () =>
        document.querySelector("[data-publisle-mount]")?.textContent ===
        "Mounted partial sums idle",
    );
    expect(
      await page
        .locator("[data-publisle-island]")
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe("none");
    await page.close();
  });
});
