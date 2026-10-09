import { describe, expect, it } from "vitest";
import { createBlock, document } from "@publisle/schema";
import { interactivePublicationProfile } from "../src/index.ts";

const text = (value: string) => [{ type: "text" as const, value }];
const paragraph = (value: string) => [
  { type: "paragraph" as const, content: text(value) },
];

function interactive(data: Record<string, unknown>) {
  return document({
    blocks: [createBlock({ type: "demo:wave", data })],
  });
}

const complete = {
  activation: "interaction",
  accessibility: { label: "Partial sums" },
  payload: { terms: 3 },
  content: {
    description: paragraph("Odd harmonics approximate a square wave."),
    instructions: paragraph("Choose how many odd harmonics to add."),
  },
  fallback: paragraph(
    "Three odd harmonics already show the square-wave steps.",
  ),
};

describe("interactive publication profile", () => {
  it("accepts a named control with instructions and a substantive alternative", () => {
    expect(
      interactivePublicationProfile().inspect(interactive(complete)),
    ).toEqual([]);
  });

  it("accepts a table or representative preset when prose fallback is absent", () => {
    const table = interactive({
      ...complete,
      fallback: [{ type: "table", caption: text("Harmonic amplitudes") }],
    });
    const { fallback: _fallback, ...withoutFallback } = complete;
    const presets = interactive({
      ...withoutFallback,
      activation: "visible",
      content: {
        title: text("Partial sums"),
        purpose: paragraph("Compare selected harmonic counts."),
        instructions: paragraph("Choose a preset."),
        presets: [
          {
            id: "three",
            description: paragraph("The third partial sum."),
          },
        ],
      },
    });
    expect(interactivePublicationProfile().inspect(table)).toEqual([]);
    expect(interactivePublicationProfile().inspect(presets)).toEqual([]);
  });

  it("reports missing name, purpose, instructions and an empty alternative", () => {
    expect(
      interactivePublicationProfile()
        .inspect(
          interactive({
            activation: "interaction",
            payload: {},
          }),
        )
        .map((item) => item.code),
    ).toEqual([
      "missing-accessible-name",
      "missing-interactive-purpose",
      "missing-control-instructions",
      "insubstantial-fallback",
    ]);
  });

  it("rejects a generic script notice as the only alternative", () => {
    expect(
      interactivePublicationProfile()
        .inspect(
          interactive({
            ...complete,
            fallback: paragraph("Please enable JavaScript."),
          }),
        )
        .map((item) => item.code),
    ).toEqual(["generic-script-notice"]);
  });

  it("keeps an explanation that also mentions JavaScript", () => {
    expect(
      interactivePublicationProfile().inspect(
        interactive({
          ...complete,
          fallback: paragraph(
            "Enable JavaScript for the live plot. Three odd harmonics already show the steps.",
          ),
        }),
      ),
    ).toEqual([]);
  });

  it("does not apply publication checks to ordinary prose", () => {
    expect(
      interactivePublicationProfile().inspect(
        document({
          blocks: [
            createBlock({
              type: "publisle:paragraph",
              data: { content: text("Just a paragraph.") },
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});
