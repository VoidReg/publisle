import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { buildPythonDemo } from "../../../tools/python/build-demo.ts";

describe("independent non-Node publication serving", () => {
  let directory: string;
  let server: ChildProcess;
  let browser: Browser;
  let url: string;
  let modules: readonly string[];
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "publisle-python-"));
    const site = await buildPythonDemo(join(directory, "site"));
    modules = site.modules;
    const python = execFileSync(
      process.env["PUBLISLE_PYTHON"] ?? "python3",
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8" },
    ).trim();
    server = spawn(
      python,
      [
        "-B",
        fileURLToPath(
          new URL("../../../tools/python/serve.py", import.meta.url),
        ),
        join(directory, "site"),
        "--digest",
        site.digest,
        "--port",
        "0",
      ],
      {
        // No Node/toolchain executables can be resolved by the artifact backend.
        env: { ...process.env, PATH: join(directory, "no-toolchain") },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    url = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(
        () => reject(new Error("Python server startup timeout")),
        10_000,
      );
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Python server exited ${String(code)}: ${output}`));
      });
      server.stderr?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      server.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+/u.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
    });
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
    if (server?.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "exit");
      server.kill("SIGTERM");
      await stopped;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("serves working host-owned islands with independent repeated placements and shared chunks", async () => {
    expect(
      modules.filter((id) =>
        /\/packages\/(?:schema|core|contracts|markdown|block-sdk)\/|\/blocks\/|\/node_modules\/(?:\.pnpm\/)?ajv(?:@|\/)/u.test(
          id,
        ),
      ),
    ).toEqual([]);
    const page = await browser.newPage();
    try {
      const missing = page.waitForResponse((response) =>
        response.url().endsWith("/missing-implementation.js"),
      );
      const loads: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("counter-")) loads.push(request.url());
      });
      await page.goto(url);
      await page.waitForFunction(
        () => document.querySelectorAll("[data-counter]").length === 4,
      );
      const buttons = page.locator("[data-counter]");
      await buttons.nth(0).click();
      expect(await buttons.allTextContents()).toEqual([
        "Count 1",
        "Count 0",
        "Count 0",
        "Count 0",
      ]);
      expect(loads).toHaveLength(1);
      const ids = await page
        .locator("[id]")
        .evaluateAll((elements) => elements.map((element) => element.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(await page.locator("[data-publisle-missing]").count()).toBe(2);
      expect((await missing).status()).toBe(404);
      expect(
        await page.locator("[data-publisle-fallback]:visible").count(),
      ).toBe(4);
      expect((await page.request.get(url + "/unknown.js")).status()).toBe(404);
      expect((await page.request.get(url + "/site.json")).status()).toBe(404);
    } finally {
      await page.close();
    }
  });

  it("retains substantive authored fallback with JavaScript disabled", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(url);
      expect(
        await page.locator("[data-publisle-fallback]:visible").count(),
      ).toBe(8);
      expect(await page.locator("body").innerText()).toContain(
        "starts at zero and increases by one",
      );
      expect(await page.locator("[data-counter]").count()).toBe(0);
    } finally {
      await context.close();
    }
  });
});
