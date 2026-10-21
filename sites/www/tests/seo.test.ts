// SEO hygiene guard: every site page needs a unique, informative title and
// meta description. Static pages declare both on BaseLayout; documentation
// pages derive them from their first heading and paragraph.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const site = join(import.meta.dirname, "..");

describe("site SEO metadata", () => {
  it("every page declares a unique title and description", () => {
    const seen = new Map<string, string>();
    const pages = readdirSync(join(site, "src/pages"), {
      recursive: true,
    }).filter(
      (name) =>
        typeof name === "string" &&
        name.endsWith(".astro") &&
        // Dynamic routes take titles from the docs collection (tested above).
        !name.includes("["),
    ) as string[];
    for (const name of pages) {
      const source = readFileSync(join(site, "src/pages", name), "utf8");
      for (const field of ["title", "description"] as const) {
        const value = new RegExp(`${field}="([^"]+)"`).exec(source)?.[1];
        expect(value, `${name} is missing ${field}`).toBeTruthy();
        expect(
          seen.has(`${field}:${value ?? ""}`),
          `duplicate ${field} "${value ?? ""}" in ${name} and ${seen.get(`${field}:${value ?? ""}`) ?? ""}`,
        ).toBe(false);
        seen.set(`${field}:${value ?? ""}`, name);
      }
    }
  });

  it("documentation uses its actual unique metadata and social image", async () => {
    const { docSources } = await import("../src/lib/docs-source.ts");
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const doc of docSources()) {
      expect(titles.has(doc.title), doc.id).toBe(false);
      expect(descriptions.has(doc.description), doc.id).toBe(false);
      expect(doc.description.length, doc.id).toBeGreaterThan(40);
      titles.add(doc.title);
      descriptions.add(doc.description);
      const image = readFileSync(join(site, "public/og/docs", `${doc.id}.png`));
      expect(image.subarray(1, 4).toString()).toBe("PNG");
    }
    const route = readFileSync(
      join(site, "src/pages/docs/[...slug].astro"),
      "utf8",
    );
    expect(route).toContain("image={`/og/docs/${entry.id}.png`}");
  });
});
