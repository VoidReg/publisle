import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { playgroundExamples } from "../src/lib/playground-examples";

const siteDirectory = fileURLToPath(new URL("..", import.meta.url));
const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
let server: Server | undefined;
let browser: Browser | undefined;
let baseUrl: string;

beforeAll(async () => {
  execFileSync("pnpm", ["build"], { cwd: siteDirectory, stdio: "pipe" });
  const dist = resolve(siteDirectory, "dist");
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = resolve(
      dist,
      `.${pathname}`,
      ...(extname(pathname) ? [] : ["index.html"]),
    );
    void readFile(file).then(
      (body) => {
        response.setHeader(
          "Content-Type",
          contentTypes[extname(file)] ?? "application/octet-stream",
        );
        response.end(body);
      },
      () => {
        response.writeHead(404);
        response.end();
      },
    );
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const { PUBLISLE_BROWSER_PATH, CI } = process.env;
  const executablePath =
    PUBLISLE_BROWSER_PATH ??
    (!CI && existsSync("/usr/bin/google-chrome")
      ? "/usr/bin/google-chrome"
      : undefined);
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox"],
  });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections();
  });
});

it("compiles all examples live and runs the interactive counter", async () => {
  if (!browser) throw new Error("Browser not started");
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.abort(),
  );
  try {
    await page.goto(`${baseUrl}/playground/`);
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    await page.getByText(/Load an example ·/).click();
    const preview = page.getByRole("region", { name: "Compiled preview" });
    const editor = page.getByRole("region", { name: "Document editor" });
    expect(await editor.isVisible()).toBe(true);
    expect(await preview.isVisible()).toBe(true);
    const editorBounds = await editor.boundingBox();
    const previewBounds = await preview.boundingBox();
    expect(previewBounds?.x).toBeGreaterThan(
      (editorBounds?.x ?? 0) + (editorBounds?.width ?? 0),
    );
    for (const example of playgroundExamples) {
      await page
        .getByRole("button", { name: new RegExp(`^${example.title}`) })
        .click();
      expect(await preview.innerText()).not.toContain(":::");
      expect(await preview.locator(".publisle-document").count()).toBe(1);
      if (example.id === "figures-tables") {
        expect(await preview.locator("figcaption").count()).toBe(2);
        await preview
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.decode());
      }
      if (["interactive-schematic", "full-article"].includes(example.id)) {
        await preview
          .getByRole("button", { name: "Explore Clocked counter" })
          .focus();
        await page.keyboard.press("Enter");
        await preview
          .getByRole("button", { name: "Clock", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("1");
        await preview
          .getByRole("button", { name: "Reset", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("0");
      }
    }
    await page.getByRole("button", { name: /^Interactive schematic/ }).click();
    await page.getByRole("tab", { name: /^markdown$/i }).click();
    const source = page.getByRole("textbox", { name: "Markdown source" });
    await source.fill(`${await source.inputValue()}\nAn edited document.\n`);
    await expect
      .poll(() => preview.innerText())
      .toContain("An edited document.");
    await preview
      .getByRole("button", { name: "Explore Clocked counter" })
      .focus();
    await page.keyboard.press("Space");
    await preview.getByRole("button", { name: "Clock", exact: true }).click();
    expect(await preview.locator("output").innerText()).toBe("1");
    expect(await preview.locator("output").count()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});

it("saves source and block edits across modes, reloads, and navigation", async () => {
  if (!browser) throw new Error("Browser not started");
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await page.goto(`${baseUrl}/playground/`);
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    await page.getByRole("tab", { name: /^markdown$/i }).click();
    const source = page.getByRole("textbox", { name: "Markdown source" });
    const authored =
      "# Saved draft\n\nContent typed just before switching mode.\n";
    await source.fill(authored);
    await page.getByRole("tab", { name: /^blocks$/i }).click();
    const preview = page.getByRole("region", { name: "Compiled preview" });
    await expect
      .poll(() => preview.innerText())
      .toContain("Content typed just before switching mode.");
    const input = page
      .getByRole("region", { name: "Document editor" })
      .locator(".segment textarea")
      .last();
    expect(await input.getAttribute("aria-label")).toBeTruthy();
    await input.fill("Block edits update while typing.");
    await expect
      .poll(() => preview.innerText())
      .toContain("Block edits update while typing.");
    await page.reload();
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    await page.getByRole("tab", { name: /^markdown$/i }).click();
    expect(await source.inputValue()).toContain(
      "Block edits update while typing.",
    );
    await source.fill("# Reloaded draft\n\nSaved without an Import click.\n");
    await page.reload();
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    expect(await source.inputValue()).toContain(
      "Saved without an Import click.",
    );
    await expect
      .poll(() => preview.innerText())
      .toContain("Saved without an Import click.");
    await page.getByRole("tab", { name: /^json$/i }).click();
    const json = page.getByRole("textbox", { name: "Document JSON" });
    await json.fill("{ invalid draft");
    await page.reload();
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    expect(await json.inputValue()).toBe("{ invalid draft");
    expect(await preview.innerText()).toContain(
      "Saved without an Import click.",
    );
  } finally {
    await page.close();
  }
});

it("persists theme through Astro navigation and searches documentation", async () => {
  if (!browser) throw new Error("Browser not started");
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/`);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page.getByRole("link", { name: "Read the docs" }).click();
    await page
      .getByRole("searchbox", { name: "Search all documentation" })
      .fill("accessibility");
    const results = page.getByRole("region", { name: "Documentation search" });
    await expect
      .poll(() => results.getByRole("link").count())
      .toBeGreaterThan(0);
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await results.getByRole("link").first().click();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await page.reload();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.reload();
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
    await page.getByRole("searchbox").fill("unfindablehippopotamus");
    await expect
      .poll(() =>
        page.getByRole("region", { name: "Documentation search" }).innerText(),
      )
      .toContain("No matching pages");
  } finally {
    await page.close();
  }
});

it("contains Quickstart code on mobile and keeps the toolbar above the scrolling editor", async () => {
  if (!browser) throw new Error("Browser not started");
  const page = await browser.newPage();
  try {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(`${baseUrl}/`);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const codePanels = page.locator(
        "section[aria-labelledby='quickstart'] pre",
      );
      expect(await codePanels.count()).toBe(2);
      for (const panel of await codePanels.all()) {
        const bounds = await panel.boundingBox();
        if (!bounds) throw new Error("Quickstart code is not visible");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        if (width <= 390) {
          expect(
            await panel.evaluate((element) => {
              element.scrollLeft = 32;
              return element.scrollLeft;
            }),
          ).toBeGreaterThan(0);
        }
      }
      await page.goto(`${baseUrl}/playground/`);
      await page.waitForSelector("astro-island[ssr]", { state: "detached" });
      await page.getByText(/Load an example ·/).click();
      await page.getByRole("button", { name: /^Full demo article/ }).click();
      await page.getByRole("tab", { name: /^blocks$/i }).click();
      const editor = page.getByRole("region", { name: "Document editor" });
      await editor.scrollIntoViewIfNeeded();
      const toolbar = page
        .getByRole("button", { name: "Reset", exact: true })
        .locator("..");
      const toolbarBounds = await toolbar.boundingBox();
      const editorBounds = await editor.boundingBox();
      if (!toolbarBounds || !editorBounds)
        throw new Error("Missing playground layout");
      expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(
        editorBounds.y,
      );
      await editor.evaluate((element) => {
        element.scrollTop = 180;
      });
      expect(
        await editor.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      if (width < 1024) {
        const preview = page.getByRole("region", { name: "Compiled preview" });
        expect(await preview.isVisible()).toBe(false);
        await page.getByRole("tab", { name: /^Preview/ }).click();
        expect(await preview.isVisible()).toBe(true);
        expect(await editor.isVisible()).toBe(false);
        await preview
          .getByRole("button", { name: "Explore Clocked counter" })
          .click();
        await preview
          .getByRole("button", { name: "Clock", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("1");
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
        await page.getByRole("tab", { name: "Edit", exact: true }).click();
        await page.getByRole("tab", { name: /^markdown$/i }).click();
        await page
          .getByRole("textbox", { name: "Markdown source" })
          .fill("# Mobile edit\n\nPhone edits survive view changes.");
        await page.getByRole("tab", { name: /^Preview/ }).click();
        expect(await preview.innerText()).toContain(
          "Phone edits survive view changes.",
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
      }
    }
  } finally {
    await page.close();
  }
});
