import { expect, it } from "vitest";
import { document, createBlock } from "@publisle/schema";
import { checkSvg, lowerImages } from "../src/worker.ts";

it("rejects SVG active content, file references, CSS imports and decoder escapes", () => {
  checkSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2" /></svg>',
  );
  checkSvg('<svg><path fill="url(#gradient)"/><use href="#shape" /></svg>');
  for (const body of [
    "<script>x</script>",
    "<foreignObject/>",
    '<image href="file:///etc/passwd"/>',
    '<image href="https://example.com/x"/>',
    '<image href="&#102;ile:///etc/passwd"/>',
    '<style>@import "https://example.com";</style>',
    "<style>a{fill:u\\72l(file:///x)}</style>",
    "<style>a{fill:url(file:///x)}</style>",
  ])
    expect(() => {
      checkSvg(`<svg>${body}</svg>`);
    }).toThrow();
  expect(() => {
    checkSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>');
  }).toThrow();
});

it("embeds inline Markdown images as adjacent figures without mutating editor data", () => {
  const input = document({
    blocks: [
      createBlock({
        type: "publisle:paragraph",
        data: {
          content: [
            {
              type: "inlineImage",
              url: "https://example.com/a.png",
              alt: "Result",
            },
          ],
        },
      }),
    ],
  });
  const original = structuredClone(input);
  const lowered = lowerImages(input);
  expect(input).toEqual(original);
  expect(lowered.sources).toEqual(["https://example.com/a.png"]);
  expect(lowered.document.blocks[1]).toMatchObject({
    type: "publisle:figure",
    data: { alt: "Result", src: "https://example.com/a.png" },
  });
});
