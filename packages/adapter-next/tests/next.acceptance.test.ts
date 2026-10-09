import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";
const directory = fileURLToPath(
  new URL("../../../examples/next/", import.meta.url),
);
let server: ChildProcess;
let browser: Browser;
let url: string;
describe("Next App Router production delivery", () => {
  beforeAll(async () => {
    await promisify(execFile)("pnpm", ["build"], {
      cwd: directory,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    const reserve = createServer();
    await new Promise<void>((done) => reserve.listen(0, "127.0.0.1", done));
    const address = reserve.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    const port = address.port;
    await new Promise<void>((done) => reserve.close(() => done()));
    url = `http://127.0.0.1:${String(port)}`;
    server = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../../../examples/next/node_modules/next/dist/bin/next",
            import.meta.url,
          ),
        ),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Next startup timeout")),
        30_000,
      );
      server.stdout?.on("data", (value: Buffer) => {
        if (value.toString().includes("Ready")) {
          clearTimeout(timer);
          done();
        }
      });
      server.on("error", reject);
    });
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
    server?.kill();
  });
  it("serves repeated static articles without Publisle browser tooling", async () => {
    const page = await browser.newPage();
    const scripts: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes(".js"))
        void response.text().then((text) => scripts.push(text));
    });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await page.locator("h2").allTextContents()).toEqual([
      "Local portable article",
      "Local portable article",
    ]);
    const ids = await page
      .locator("[id]")
      .evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(scripts.join("\n")).not.toContain("data-publisle-mount");
    expect(scripts.join("\n")).not.toContain("compilePublication");
    await page.close();
  });
  it("mounts independent islands and disposes them during client navigation", async () => {
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
    await page.getByRole("link", { name: "Static article" }).click();
    await page.waitForFunction(() => window.__unmounts === 2);
    expect(await page.locator("[data-counter]").count()).toBe(0);
    await page.close();
  });
});

declare global {
  interface Window {
    __mounts?: number;
    __unmounts?: number;
  }
}
