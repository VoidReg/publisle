import { defineInteractiveBlock } from "@publisle/block-sdk";
import { parseFlowNodes, parseInlineNodes } from "@publisle/blocks-core";
import {
  SchemaParseError,
  type InteractiveEnvelope,
  type JsonValue,
  type SemanticDeclaration,
} from "@publisle/schema";
import { parseFourierPayload as parsePayload } from "./input.ts";
import type { FourierPayload } from "./model.ts";

export { readFourierInput } from "./input.ts";

export function parseFourierPayload(value: unknown): FourierPayload {
  try {
    return parsePayload(value);
  } catch (error) {
    throw new SchemaParseError(
      "invalid-block-data",
      error instanceof Error ? error.message : String(error),
    );
  }
}

const prose = (value: string) => [
  { type: "paragraph" as const, content: [{ type: "text" as const, value }] },
];

export function defaultFourier(): InteractiveEnvelope<FourierPayload> {
  return {
    activation: "interaction",
    accessibility: { label: "Square-wave partial sums" },
    content: {
      title: [{ type: "text", value: "Partial sums of the square wave" }],
      description: prose(
        "Compare one, three, and fifteen odd harmonics of the square wave.",
      ),
      purpose: prose(
        "Show how a finite Fourier sine series approaches the square wave away from its jumps.",
      ),
      instructions: prose(
        "Choose a harmonic count. The plot and sample table update together.",
      ),
      fallback: prose(
        "With three odd harmonics the partial sum at π/2 is 1.1034742721038078. At x=π the sum is numerically 0, not the square-wave jump.",
      ),
    },
    payload: {
      terms: 3,
      samples: 9,
      presets: [
        { id: "fundamental", label: "One harmonic", terms: 1 },
        { id: "three", label: "Three harmonics", terms: 3 },
        { id: "fifteen", label: "Fifteen harmonics", terms: 15 },
      ],
    },
  };
}

export const fourierSemantics = {
  entities: [
    {
      id: "terms",
      kind: "input",
      name: "Odd-harmonic count",
      origin: "authored",
      binding: "/payload/terms",
      valueType: "integer",
    },
    {
      id: "set-terms",
      kind: "action",
      name: "Choose harmonic count",
      origin: "declared-rule",
    },
    {
      id: "use-three",
      kind: "action",
      name: "Select three harmonics",
      origin: "declared-rule",
    },
    {
      id: "curve",
      kind: "view",
      name: "Partial-sum samples",
      origin: "declared-rule",
      binding: "/payload/terms",
      valueType: "integer",
      implementation: {
        status: "implementation-bound",
        limitation:
          "The host evaluates the sine series. This declaration does not compute samples.",
      },
    },
  ],
  composition: {
    profile: "urn:publisle:composition:beta",
    fields: [
      {
        id: "terms",
        binding: "/payload/terms",
        type: "integer",
        writable: true,
        shareable: true,
        minimum: 1,
        maximum: 64,
      },
    ],
    presets: [
      { id: "fundamental", values: { terms: 1 } },
      { id: "three", values: { terms: 3 } },
      { id: "fifteen", values: { terms: 15 } },
    ],
    operations: [
      { id: "set-terms", kind: "assign", field: "terms" },
      { id: "use-three", kind: "preset", preset: "three" },
    ],
    views: [{ id: "curve", field: "terms" }],
    abstractions: [
      { entity: "terms", kind: "parameter-control" },
      { entity: "curve", kind: "series" },
      { entity: "set-terms", kind: "narrative-action" },
      { entity: "use-three", kind: "narrative-action" },
    ],
    relations: [],
    ports: [
      { id: "input", direction: "input", field: "terms" },
      { id: "output", direction: "output", field: "terms" },
    ],
    observations: [
      {
        id: "three-harmonics",
        preset: "three",
        output: "curve",
        explanation:
          "The three-harmonic preset selects 3 odd harmonics. It does not assert the plotted samples.",
        assertion: {
          expected: 3,
          tolerance: 0,
          provenance: {
            producer: "authored preset",
            evidence: "examples/fourier-demo three-harmonics",
          },
        },
      },
    ],
  },
} as const satisfies SemanticDeclaration;

export const fourierDefinition = defineInteractiveBlock({
  type: "demo:fourier-partial-sum",
  schemaVersion: 1,
  schema: { parse: parseFourierPayload },
  descriptor: {
    displayName: "Square-wave partial sums",
    description:
      "Host-owned finite Fourier sine series for a square wave, with authored presets and sample rows.",
    payloadSchema: {
      type: "object",
      properties: {
        terms: {
          type: "number",
          description: "Selected odd-harmonic count, matching one preset.",
        },
        samples: {
          type: "number",
          description: "Odd sample count from -π through π.",
        },
        presets: {
          type: "array",
          description: "Authored harmonic counts the host may select.",
        },
      },
    },
    documentation:
      "The host evaluates (4/π) Σ sin((2k-1)x)/(2k-1). Publisle does not verify that mathematics or pixel identity of the plot.",
  },
  content: {
    parseTitle: (value) =>
      parseInlineNodes(value, "content.title") as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[],
  },
  defaults: defaultFourier(),
  semantics: fourierSemantics,
});
