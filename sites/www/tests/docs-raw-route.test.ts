import { it, expect } from "vitest";
import { docRawRoute } from "../src/lib/docs-source";
it("links directly to raw Markdown without a trailing slash", () => {
  expect(docRawRoute("standards")).toBe("/docs/standards/README.md");
  expect(docRawRoute("guides/releases")).toBe("/docs/guides/releases.md");
});
