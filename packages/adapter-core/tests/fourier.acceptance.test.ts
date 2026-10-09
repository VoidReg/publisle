import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { fourierHost } from "../../../tools/benchmarks/fourier-host.ts";

for (const framework of ["react", "svelte"] as const)
  describe(`${framework} Fourier native/artifact publication`, () => {
    let browser: Browser;
    beforeAll(async () => {
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
    for (const mode of ["native", "artifact"] as const)
      it(`${mode} supports keyboard presets, sample agreement, independent placements, print and no JavaScript without reader tooling`, async () => {
        await fourierHost({
          framework,
          mode,
          browser: async (fixture) => {
            expect(
              fixture.modules.filter((id) =>
                /\/packages\/(?:schema|core|contracts|markdown|block-sdk)\/|\/blocks\/(?:core|technical)\/|\/node_modules\/(?:\.pnpm\/)?ajv(?:@|\/)/u.test(
                  id,
                ),
              ),
            ).toEqual([]);
            const page = await browser.newPage();
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            const requests: string[] = [];
            page.on("request", (request) =>
              requests.push(new URL(request.url()).pathname),
            );
            try {
              await page.goto(fixture.url);
              await page.waitForFunction(
                () =>
                  (window as unknown as { __fixtureReady: boolean })
                    .__fixtureReady,
              );
              const implementationChunks = fixture.chunks
                .filter((chunk) =>
                  chunk.modules.some((id) =>
                    id.includes("fourier-demo/src/PartialSum"),
                  ),
                )
                .map((chunk) => `/${chunk.fileName}`);
              expect(implementationChunks.length).toBeGreaterThan(0);
              expect(
                requests.filter((path) => implementationChunks.includes(path)),
              ).toEqual([]);
              const activate = page.locator("[data-publisle-activate]");
              await activate.first().focus();
              await page.keyboard.press("Enter");
              await page.locator('[role="status"]').first().waitFor();
              expect(await page.locator('[role="status"]').count()).toBe(1);
              const three = page.getByRole("button", {
                name: "Three harmonics",
                exact: true,
              });
              expect(await three.getAttribute("aria-pressed")).toBe("true");
              expect(
                await page
                  .locator("tbody tr")
                  .nth(6)
                  .locator("td")
                  .nth(1)
                  .textContent(),
              ).toBe("1.103474");
              const fifteen = page.getByRole("button", {
                name: "Fifteen harmonics",
                exact: true,
              });
              await fifteen.focus();
              await page.keyboard.press("Space");
              await page.waitForFunction(() =>
                document
                  .querySelector('[role="status"]')
                  ?.textContent?.includes("15 odd"),
              );
              expect(
                await page
                  .locator("tbody tr")
                  .nth(6)
                  .locator("td")
                  .nth(1)
                  .textContent(),
              ).toBe("1.021197");
              await activate.nth(1).focus();
              await page.keyboard.press("Space");
              await page.waitForFunction(
                () => document.querySelectorAll('[role="status"]').length === 2,
              );
              expect(
                await page.locator('[role="status"]').allTextContents(),
              ).toEqual([
                "15 odd harmonics selected",
                "3 odd harmonics selected",
              ]);
              expect(
                requests.filter((path) => implementationChunks.includes(path)),
              ).toHaveLength(implementationChunks.length);
              await page.emulateMedia({ media: "print" });
              expect(
                await page.locator("[data-publisle-mount]").first().isVisible(),
              ).toBe(false);
              expect(
                await page
                  .locator("[data-publisle-fallback]")
                  .first()
                  .isVisible(),
              ).toBe(true);
              expect(errors).toEqual([]);
            } finally {
              await page.close();
            }
            const context = await browser.newContext({
              javaScriptEnabled: false,
            });
            try {
              const page = await context.newPage();
              await page.goto(fixture.url);
              expect(await page.locator("body").textContent()).toContain(
                "1.1034742721038078",
              );
              expect(
                await page
                  .locator("[data-publisle-fallback]")
                  .first()
                  .isVisible(),
              ).toBe(true);
            } finally {
              await context.close();
            }
          },
        });
      }, 60000);
  });
