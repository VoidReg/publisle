import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
const directory = fileURLToPath(
  new URL("../../../examples/astro/", import.meta.url),
);
let server: Server;
let browser: Browser;
let url: string;
describe("Astro production publication delivery", () => {
  beforeAll(async () => {
    await promisify(execFile)("pnpm", ["build"], {
      cwd: directory,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    server = createServer((request, response) => {
      const name = new URL(request.url ?? "/", "http://localhost").pathname;
      const path =
        name === "/"
          ? "index.html"
          : name === "/interactive"
            ? "interactive/index.html"
            : name.slice(1);
      void readFile(join(directory, "dist", path))
        .then((bytes) => {
          response.setHeader(
            "Content-Type",
            path.endsWith(".js") ? "text/javascript" : "text/html",
          );
          response.end(bytes);
        })
        .catch(() => {
          response.statusCode = 404;
          response.end();
        });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    url = `http://127.0.0.1:${String(address.port)}`;
    const executablePath =
      process.env["PUBLISLE_BROWSER_PATH"] ??
      (existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined);
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"],
    });
  }, 150_000);
  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((done) => server?.close(() => done()));
  });
  it("emits repeated static articles with no JavaScript", async () => {
    const page = await browser.newPage();
    await page.goto(url);
    expect(await page.locator("h2").allTextContents()).toEqual([
      "Local portable article",
      "Local portable article",
    ]);
    expect(await page.locator("script").count()).toBe(0);
    const ids = await page
      .locator("[id]")
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    await page.close();
  });
  it("attaches isolated host islands and cleans up on removal", async () => {
    const page = await browser.newPage();
    await page.goto(url + "/interactive");
    await page.waitForFunction(
      () => document.querySelectorAll("[data-counter]").length === 2,
    );
    await page.locator("[data-counter]").first().click();
    expect(await page.locator("[data-counter]").allTextContents()).toEqual([
      "Count 1",
      "Count 0",
    ]);
    await page
      .locator("publisle-reader")
      .first()
      .evaluate((element) => element.remove());
    await page.waitForFunction(() => window.__unmounts === 1);
    expect(await page.locator("[data-counter]").allTextContents()).toEqual([
      "Count 0",
    ]);
    await page.close();
  });
});
