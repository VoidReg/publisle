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

it("renders all examples and remounts the counter after view and source changes", async () => {
  if (!browser) throw new Error("Browser not started");
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Keep third-party embeds out of this local rendering test.
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.abort(),
  );
  try {
    await page.goto(`${baseUrl}/playground/`);
    await page.waitForSelector("astro-island[ssr]", { state: "detached" });
    const preview = page.getByRole("region", { name: "Compiled preview" });
    for (const example of playgroundExamples) {
      await page
        .getByRole("button", { name: new RegExp(`^${example.title}`) })
        .click();
      await page.getByRole("tab", { name: /^Preview/ }).click();
      expect(await preview.innerText()).not.toContain(":::");
      expect(await preview.locator(".publisle-document").count()).toBe(1);
      if (example.id === "figures-tables") {
        expect(await preview.locator("figcaption").count()).toBe(2);
        await preview
          .locator("img")
          .evaluate((image: HTMLImageElement) => image.decode());
        expect(
          await preview
            .locator("img")
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        ).toBeGreaterThan(0);
      }
      if (["interactive-schematic", "full-article"].includes(example.id)) {
        await preview
          .getByRole("button", { name: "Explore Clocked counter" })
          .click();
        await preview
          .getByRole("button", { name: "Clock", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("1");
        await preview
          .getByRole("button", { name: "Reset", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("0");
        await page.getByRole("tab", { name: "Edit", exact: true }).click();
        await page.getByRole("tab", { name: /^Preview/ }).click();
        await preview
          .getByRole("button", { name: "Explore Clocked counter" })
          .focus();
        await page.keyboard.press("Enter");
        await preview
          .getByRole("button", { name: "Clock", exact: true })
          .click();
        expect(await preview.locator("output").innerText()).toBe("1");
        expect(await preview.locator("output").count()).toBe(1);
      }
      await page.getByRole("tab", { name: "Edit", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Interactive schematic/ }).click();
    await page.getByRole("tab", { name: /^markdown$/i }).click();
    const source = page.getByRole("textbox", { name: "Markdown source" });
    await source.fill(`${await source.inputValue()}\nAn edited document.\n`);
    await page
      .getByRole("button", { name: "Import Markdown", exact: true })
      .click();
    await page.getByRole("tab", { name: /^Preview/ }).click();
    expect(await preview.innerText()).toContain("An edited document.");
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
