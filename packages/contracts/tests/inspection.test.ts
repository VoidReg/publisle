import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  canonicalizeJson,
  parseDocument,
  type SemanticDeclaration,
} from "@publisle/schema";
import { createRegistry } from "../../core/src/index.ts";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import {
  BETA_SCHEMA_DEPENDENCIES,
  digestJson,
  exportSemanticDocument,
  inspectDocument,
  lockDocument,
} from "@publisle/contracts";
import fixture from "../fixtures/meaning.json" with { type: "json" };
import counter from "../fixtures/portable-counter.json" with { type: "json" };

async function unfamiliar() {
  const data = fixture.example.data;
  const definition = defineSchemaBlock({
    type: "custom:unfamiliar-wave",
    schemaVersion: 1,
    semantics: fixture.example.semantics as SemanticDeclaration,
    contract: {
      ...counter,
      dataSchema: fixture.example.structure,
      schemaDependencies: [...BETA_SCHEMA_DEPENDENCIES],
      documentation: {
        ...counter.documentation,
        name: "Unfamiliar Fourier explorer",
        purpose:
          "Explore declared amplitude and frequency inputs and a supplied spectrum.",
        validExamples: [{ input: data, output: data }],
        invalidExamples: [{ input: null, diagnostic: "invalid-data" }],
      },
      behavior: {
        limitations: ["Computing the spectrum requires host scientific code."],
        executable: {
          spectrum: "No standardized Fourier computation is available.",
        },
      },
    },
  });
  return lockDocument(
    parseDocument({
      schemaVersion: 1,
      blocks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: definition.type,
          schemaVersion: 1,
          data,
        },
      ],
    }),
    createRegistry([definition]),
  );
}

describe("renderer-free semantic exports and inspection", () => {
  // Contract export is shared immutable setup, not the operation being tested.
  let locked: Awaited<ReturnType<typeof unfamiliar>>;
  beforeAll(async () => {
    locked = await unfamiliar();
  }, 30_000);
  it("extracts unfamiliar instance values, effects, observations, presets and unavailable computation", async () => {
    const output = await inspectDocument(locked.document, {
      bundle: locked.bundle,
      offline: true,
    });
    expect(JSON.stringify(output)).toContain('"value":2');
    expect(JSON.stringify(output)).toContain("spectrum");
    expect(JSON.stringify(output)).toContain(
      "No standardized Fourier computation",
    );
    expect(JSON.stringify(output)).toContain(
      '"verification":"not-established"',
    );
    expect(output["blocks"]).toMatchObject([
      {
        answers: {
          canChange: [
            {
              declaration: { id: "frequency" },
              pointer: "/blocks/0/data/payload/frequency",
              value: 2,
            },
            { declaration: { id: "amplitude" }, value: 1 },
            { declaration: { id: "reset" } },
          ],
          illustratedStates: {
            presets: [{ id: "initial", value: { frequency: 2, amplitude: 1 } }],
          },
        },
      },
    ]);
  });

  it("linked and standalone exports have identical meaning and reuse verified cached contracts", async () => {
    const cache = new Map(
      locked.bundle.contracts.map((entry) => [entry.id, entry]),
    );
    const linked = await exportSemanticDocument(locked.document, {
      cache,
      offline: true,
    });
    const standalone = await exportSemanticDocument(locked.document, {
      cache,
      offline: true,
      mode: "standalone",
    });
    const {
      mode: _mode,
      contracts: _contracts,
      ...standaloneMeaning
    } = standalone;
    const { mode: _linkedMode, ...linkedMeaning } = linked;
    expect(standaloneMeaning).toEqual(linkedMeaning);
    expect(standalone["contracts"]).toHaveLength(1);
    expect(linked["source"]).toEqual({
      digest: await digestJson(locked.document),
      schemaVersion: 1,
    });
    expect(
      await exportSemanticDocument(locked.document, { cache, offline: true }),
    ).toEqual(linked);
  });

  it("reports missing contracts without fetching, inventing interpretation or changing canonical data", async () => {
    const before = canonicalizeJson(locked.document);
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const exported = await exportSemanticDocument(locked.document, {
        offline: true,
        mode: "standalone",
      });
      expect(exported["unresolved"]).toHaveLength(1);
      expect(exported["blocks"]).toMatchObject([
        {
          represents: null,
          entities: [],
          explanation: { status: "authored" },
          diagnostics: [{ code: "unresolved-contract" }],
        },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      expect(canonicalizeJson(locked.document)).toBe(before);
    } finally {
      fetch.mockRestore();
    }
  });

  it("fails on substituted contract bytes rather than hiding integrity failures", async () => {
    const cache = new Map(
      locked.bundle.contracts.map((entry) => [
        entry.id,
        { ...entry, digest: "sha256:" + "0".repeat(64) },
      ]),
    );
    await expect(
      exportSemanticDocument(locked.document, { cache, offline: true }),
    ).rejects.toThrow("integrity");
  });
});
