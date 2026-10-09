import { describe, expect, it } from "vitest";
import { compileComposition } from "@publisle/adapter-core";
import { compilePublication } from "@publisle/adapter-core";
import { prepare } from "@publisle/core";
import { fromMarkdown } from "@publisle/markdown";
import {
  validateSemantics,
  type JsonPrimitive,
  type SemanticDeclaration,
} from "@publisle/schema";
import {
  defaultFourier,
  fourierSemantics,
  parseFourierPayload,
} from "@publisle/example-fourier";
import {
  squarePartialSum,
  squareWave,
  withinTolerance,
} from "@publisle/example-fourier/model";
import { FOURIER_PARTIAL_SUMS } from "../src/articles.ts";
import { CORE_REGISTRY } from "../src/editor.ts";

import samples from "../../fourier-demo/fixtures/samples.json" with { type: "json" };
const PINNED = samples.cases;

interface Session {
  preset(id: string): void;
  read(): Readonly<Record<string, JsonPrimitive>>;
}
interface Placement {
  session(id: string): Session;
}

describe("host Fourier partial sums", () => {
  it("matches pinned samples within the declared absolute tolerance", () => {
    for (const sample of PINNED)
      expect(
        withinTolerance(
          squarePartialSum(sample.terms, sample.x),
          sample.expected,
        ),
      ).toBe(true);
    expect(withinTolerance(squarePartialSum(3, Math.PI / 2), 1.2)).toBe(false);
  });

  it("rejects a harmonic count outside the authored range", () => {
    expect(() => squarePartialSum(0, 0)).toThrow(/integer from 1 through 64/u);
    expect(() =>
      parseFourierPayload({
        terms: 2,
        samples: 9,
        presets: [{ id: "three", label: "Three harmonics", terms: 3 }],
      }),
    ).toThrow(/must match an authored preset/u);
  });

  it("rejects ambiguous presets, nonfinite samples and invalid sample counts", () => {
    const payload = defaultFourier().payload;
    expect(() =>
      parseFourierPayload({
        ...payload,
        presets: [payload.presets[0], payload.presets[0]],
      }),
    ).toThrow(/unique/u);
    for (const samples of [2, 4, 66, 3.5])
      expect(() => parseFourierPayload({ ...payload, samples })).toThrow();
    for (const x of [NaN, Infinity, -Infinity])
      expect(() => squarePartialSum(3, x)).toThrow(/finite/u);
    for (const x of [-2 * Math.PI, -Math.PI, 0, Math.PI, 2 * Math.PI])
      expect(squareWave(x)).toBe(0);
    expect(squareWave(Math.PI - 1e-8)).toBe(1);
    expect(squareWave(Math.PI + 1e-8)).toBe(-1);
  });

  it("selects the authored preset and keeps the numerical claim on the host fixture", async () => {
    const data = defaultFourier();
    expect(
      validateSemantics(
        fourierSemantics as unknown as SemanticDeclaration,
        data,
      ),
    ).toEqual([]);
    const code = compileComposition({
      documentDigest: `sha256:${"a".repeat(64)}`,
      instances: [
        {
          blockId: "partial-sums",
          contractDigest: `sha256:${"b".repeat(64)}`,
          data,
          semantics: fourierSemantics as unknown as SemanticDeclaration,
        },
      ],
      connections: [],
    });
    expect(code).not.toMatch(/squarePartialSum|Math\.sin/u);
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    )) as { createPlacement(): Placement };
    const session = module.createPlacement().session("partial-sums");
    session.preset("three");
    expect(session.read()["terms"]).toBe(3);
    expect(
      withinTolerance(squarePartialSum(3, Math.PI / 2), 1.1034742721038078),
    ).toBe(true);
  });

  it("publishes the static explanation on the native and artifact paths", () => {
    const imported = fromMarkdown(FOURIER_PARTIAL_SUMS);
    expect(imported.diagnostics).toEqual([]);
    const prepared = prepare(imported.document!, { registry: CORE_REGISTRY });
    expect(prepared.diagnostics).toEqual([]);
    const publication = compilePublication(prepared.document!);
    expect(publication.html).toContain("1.1034742721038078");
    expect(publication.html).toContain("data-publisle-fallback");
    expect(publication.html).not.toContain("Enable JavaScript");
    expect(publication.islands[0]?.props).toMatchObject({
      payload: { terms: 3, samples: 9 },
    });
    expect(JSON.stringify(publication)).not.toMatch(
      /squarePartialSum|@publisle\/example-fourier\/model/u,
    );
  });
});
