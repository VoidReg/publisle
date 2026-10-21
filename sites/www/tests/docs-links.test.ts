import { describe, expect, it } from "vitest";
import { rewriteLinks } from "../src/lib/docs-loader";

const context = {
  file: "/checkout/docs/standards/json-wire.md",
  docsDir: "/checkout/docs",
  knownFiles: new Set([
    "standards/README.md",
    "standards/contracts.md",
    "guides/meaning.md",
  ]),
  routePrefix: "/docs",
};

describe("documentation links", () => {
  it("routes known documentation and section overviews to the site", () => {
    expect(
      rewriteLinks(
        "[Contract](contracts.md#identity) [Overview](README.md) [Guide](../guides/meaning.md)",
        context,
      ),
    ).toBe(
      "[Contract](/docs/standards/contracts/#identity) [Overview](/docs/standards/) [Guide](/docs/guides/meaning/)",
    );
  });
  it("routes repository files and directories to GitHub with anchors", () => {
    expect(
      rewriteLinks(
        "[Fixture](../../packages/contracts/fixtures/canonical.json) [Code](../../tools/python/README.md#citations) [Directory](../../packages/contracts/schemas)",
        context,
      ),
    ).toBe(
      "[Fixture](https://github.com/VoidReg/publisle/blob/main/packages/contracts/fixtures/canonical.json) [Code](https://github.com/VoidReg/publisle/blob/main/tools/python/README.md#citations) [Directory](https://github.com/VoidReg/publisle/blob/main/packages/contracts/schemas)",
    );
  });
  it("uses GitHub for documentation outside the hosted collection", () => {
    expect(rewriteLinks("[Other](../other.md#section)", context)).toBe(
      "[Other](https://github.com/VoidReg/publisle/blob/main/docs/other.md#section)",
    );
  });
  it("uses raw repository URLs for images", () => {
    expect(rewriteLinks("![Figure](../../assets/figure.svg)", context)).toBe(
      "![Figure](https://raw.githubusercontent.com/VoidReg/publisle/main/assets/figure.svg)",
    );
  });
  it("preserves external URLs, site paths, local anchors, and targets outside the checkout", () => {
    const markdown =
      "[External](https://example.com) [Site](/playground/) [Anchor](#heading) [Outside](../../../other.md)";
    expect(rewriteLinks(markdown, context)).toBe(markdown);
  });
});
