import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { buildCompositionDemo } from "../../../tools/composition/demo.ts";

describe("precompiled bounded composition reader", () => {
  let browser: Browser;
  let demo: Awaited<ReturnType<typeof buildCompositionDemo>>;
  beforeAll(async () => {
    demo = await buildCompositionDemo();
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
  it("exchanges state and authored presets between two islands without cross-binding repeated placements", async () => {
    expect(demo.modules).toEqual(["\0composition-demo"]);
    expect(demo.code).not.toMatch(
      /@publisle|Ajv|parseComposition|validateSemantics/u,
    );
    expect(demo.gzipBytes).toBeLessThan(5000);
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(demo.html);
    await page.addScriptTag({ content: demo.code, type: "module" });
    const first = page.getByRole("article", { name: "first article" });
    const second = page.getByRole("article", { name: "second article" });
    await first.getByRole("button", { name: "High preset" }).click();
    await first.getByRole("status").filter({ hasText: "Updated" }).waitFor();
    expect(await first.getByLabel("Related value").textContent()).toBe("8");
    expect(await second.getByLabel("Related value").textContent()).toBe("1");
    await first.getByRole("button", { name: "Save snapshot" }).click();
    await first.getByRole("button", { name: "Reset", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-placement="first"] [aria-label="Related value"]',
        )?.textContent === "1",
    );
    await first.getByRole("button", { name: "Restore snapshot" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-placement="first"] [aria-label="Related value"]',
        )?.textContent === "8",
    );
    await first.getByRole("button", { name: "Simulate host failure" }).click();
    await first
      .getByRole("status")
      .filter({ hasText: "Host view failed" })
      .waitFor();
    expect(await first.getByLabel("Related value").textContent()).toBe("5");
    await second.getByRole("button", { name: "High preset" }).click();
    await second.getByRole("status").filter({ hasText: "Updated" }).waitFor();
    expect(await second.getByLabel("Related value").textContent()).toBe("8");
    await first.getByRole("button", { name: "Dispose", exact: true }).click();
    expect(await first.getByRole("slider").isDisabled()).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
  it("retains useful accessible authored fallback without JavaScript", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setContent(demo.html);
    expect(
      await page.getByText("Authored fallback:", { exact: false }).count(),
    ).toBe(2);
    expect(await page.getByLabel("Related value").allTextContents()).toEqual([
      "1",
      "1",
    ]);
    await context.close();
  });
});
