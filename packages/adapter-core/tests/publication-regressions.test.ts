import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { coreBlockDefinitions, paragraph } from "@publisle/blocks-core";
import { createRegistry, prepare } from "@publisle/core";
import { document } from "@publisle/schema";
import { compilePublication, instantiatePublication } from "../src/index.ts";
import { instantiateHtml } from "../src/html.ts";

it("filters the shared adversarial URL corpus through the publication API", () => {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../../contracts/fixtures/unsafe-urls.json", import.meta.url),
      "utf8",
    ),
  ) as { url: string; safe: boolean }[];
  for (const { url, safe } of fixtures) {
    const input = document({
      blocks: [
        paragraph({
          content: [
            { type: "link", url, children: [{ type: "text", value: "Link" }] },
          ],
        }),
      ],
    });
    const prepared = prepare(input, {
      registry: createRegistry(coreBlockDefinitions),
    });
    expect(prepared.document).toBeDefined();
    const artifact = compilePublication(prepared.document!);
    expect(artifact.html.includes("<a "), url).toBe(safe);
    const placed = instantiatePublication(artifact, "test");
    expect(placed.html.includes("<a "), url).toBe(safe);
  }
});

it("preserves untouched attributes byte for byte and escapes changed references once", () => {
  for (const tag of ["style", "textarea", "title"]) {
    const raw = `<${tag}><a data-publisle-id="fake"></${tag}><a href="#fake">x</a>`;
    expect(instantiateHtml(raw, "one")).toBe(raw);
  }
  const attributes =
    " href=\"https://example.com/?a=1&amp;b=2\" title='A &quot;quote&quot; &amp; B' disabled";
  expect(instantiateHtml(`<a${attributes}>link</a>`, "one")).toBe(
    `<a${attributes}>link</a>`,
  );
  const html =
    '<div data-publisle-id="a&amp;b"><img src="/img?a=1&amp;b=2" alt="&quot;image&quot;"><a data-publisle-ref="a&amp;b" aria-describedby="a&amp;b external">link</a></div>';
  const placed = instantiateHtml(html, "one");
  expect(placed).toContain('id="one-a&amp;b"');
  expect(placed).toContain('href="#one-a&amp;b"');
  expect(placed).toContain('aria-describedby="one-a&amp;b external"');
  expect(placed).toContain('src="/img?a=1&amp;b=2" alt="&quot;image&quot;"');
  expect(placed).not.toContain("&amp;amp;");
  expect(
    instantiateHtml(
      '<!-- <a data-publisle-id="fake"> --><a href="#fake">x</a>',
      "one",
    ),
  ).toBe('<!-- <a data-publisle-id="fake"> --><a href="#fake">x</a>');
});
