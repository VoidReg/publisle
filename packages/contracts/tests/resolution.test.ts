import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  canonicalizeJson,
  createBlock,
  document,
  parseContractDependencies,
} from "@publisle/schema";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import { createRegistry, prepare } from "../../core/src/index.ts";
import source from "../fixtures/portable-counter.json" with { type: "json" };
import {
  exportBlockContract,
  exportDocumentContracts,
  lockDocument,
  resolveContracts,
  validateLockedDocument,
  type ContractFetchPolicy,
} from "@publisle/contracts";

const definition = () =>
  defineSchemaBlock({
    type: "example:counter",
    schemaVersion: 1,
    contract: source,
  });
const policy: ContractFetchPolicy = {
  origins: ["https://contracts.test"],
  maxBytes: 100000,
  timeoutMs: 1000,
};
let baseline: Awaited<ReturnType<typeof lockDocument>> | undefined;
beforeAll(async () => {
  const block = createBlock({ type: "example:counter", data: { count: 3 } });
  baseline = await lockDocument(
    document({
      blocks: [block, createBlock({ type: block.type, data: block.data })],
    }),
    createRegistry([definition()]),
  );
});
function fixture() {
  if (!baseline) throw new Error("Fixture setup must complete before use.");
  return Promise.resolve(structuredClone(baseline));
}
describe("locked source and bounded contract resolution", () => {
  it("pins a shared type once, preserves source and freezes existing versions", async () => {
    const locked = await fixture();
    expect(locked.original).not.toHaveProperty("dependencies");
    expect(locked.document.dependencies).toHaveLength(1);
    expect(locked.document.schemaVersion).toBe(1);
    expect(locked.document.blocks).toEqual(locked.original.blocks);
    expect(
      await validateLockedDocument(locked.document, locked.bundle),
    ).toEqual(locked.document);
    expect(
      (await lockDocument(locked.document, createRegistry([definition()])))
        .document,
    ).toEqual(locked.document);
  });
  it("rejects missing/extra/invalid manifests, changed pins and invalid canonical block data", async () => {
    const locked = await fixture();
    await expect(
      validateLockedDocument(locked.original, locked.bundle),
    ).rejects.toThrow("requires");
    await expect(
      validateLockedDocument(
        { ...locked.document, dependencies: [] },
        locked.bundle,
      ),
    ).rejects.toThrow("exactly");
    await expect(
      validateLockedDocument({ ...locked.document, blocks: [] }, locked.bundle),
    ).rejects.toThrow("exactly");
    await expect(
      validateLockedDocument(
        {
          ...locked.document,
          blocks: locked.document.blocks.map((block) => ({
            ...block,
            data: { count: -1 },
          })),
        },
        locked.bundle,
      ),
    ).rejects.toThrow("invalid-data");
    const changed = definition();
    const registry = createRegistry([
      {
        ...changed,
        contract: {
          ...changed.contract,
          provenance: { publisher: "Changed publisher", license: "MIT" },
        },
      },
    ]);
    await expect(lockDocument(locked.document, registry)).rejects.toThrow(
      "Existing immutable pins differ",
    );
    expect(() =>
      parseContractDependencies([
        {
          type: "example:counter",
          schemaVersion: 1,
          id: "latest",
          digest: "sha256:fake",
        },
      ]),
    ).toThrow();
    expect(() =>
      parseContractDependencies([
        ...(locked.document.dependencies ?? []),
        ...(locked.document.dependencies ?? []),
      ]),
    ).toThrow("Duplicate");
  });
  it("prepares approved pins without resolution or source mutation", async () => {
    const locked = await fixture();
    const snapshot = canonicalizeJson(locked.document);
    const registry = createRegistry([definition()]);
    expect(prepare(locked.document, { registry }).diagnostics[0]?.code).toBe(
      "missing-contract-pin",
    );
    const prepared = prepare(locked.document, {
      registry,
      contractPins: locked.document.dependencies ?? [],
    });
    expect(prepared.document?.dependencies).toEqual(
      locked.document.dependencies,
    );
    expect(canonicalizeJson(locked.document)).toBe(snapshot);
    const normalizing = createRegistry([
      { ...definition(), normalize: () => ({ count: 4 }) },
    ]);
    expect(
      prepare(locked.document, {
        registry: normalizing,
        contractPins: locked.document.dependencies ?? [],
      }).diagnostics.some(
        (entry) => entry.code === "locked-source-conversion-required",
      ),
    ).toBe(true);
    expect(canonicalizeJson(locked.document)).toBe(snapshot);
  });
  it("prefers supplied bundles over cache/remote and never fetches in offline mode", async () => {
    const locked = await fixture();
    const fetcher = vi.fn<typeof fetch>(() => {
      throw new Error("must not fetch");
    });
    const cache = new Map<string, unknown>();
    const pins = locked.document.dependencies ?? [];
    const remote = { policy, locations: {}, fetch: fetcher };
    expect(
      await resolveContracts(pins, { bundle: locked.bundle, cache, remote }),
    ).toEqual(locked.bundle);
    expect(
      await resolveContracts(pins, { cache, offline: true, remote }),
    ).toEqual(locked.bundle);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      resolveContracts(pins, { offline: true, remote }),
    ).rejects.toThrow("Missing immutable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("detects tampered cache entries instead of silently replacing them with remote content", async () => {
    const locked = await fixture();
    const entry = locked.bundle.contracts[0];
    if (!entry) throw new Error("Missing fixture.");
    const cache = new Map([
      [entry.id, { ...entry, digest: "sha256:tampered" }],
    ]);
    const fetcher = vi.fn<typeof fetch>(() => {
      throw new Error("must not fetch");
    });
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        cache,
        remote: { policy, locations: {}, fetch: fetcher },
      }),
    ).rejects.toThrow("integrity");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retrieves static JSON only under explicit policy and commits verified cache content", async () => {
    const locked = await fixture();
    const entry = locked.bundle.contracts[0];
    if (!entry) throw new Error("Missing fixture.");
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(canonicalizeJson(entry))),
    );
    const cache = new Map<string, unknown>();
    expect(
      await resolveContracts(locked.document.dependencies ?? [], {
        cache,
        remote: {
          policy,
          locations: { [entry.id]: ["https://contracts.test/counter.json"] },
          fetch: fetcher,
        },
      }),
    ).toEqual(locked.bundle);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual",
      credentials: "omit",
    });
    expect(cache.has(entry.id)).toBe(true);
  });
  it.each([
    "http://contracts.test/a.json",
    "https://evil.test/a.json",
    "file:///tmp/a.json",
    "https://user:secret@contracts.test/a.json",
    "https://contracts.test/a.json#fragment",
  ])("denies unapproved location %s without retrieval", async (location) => {
    const locked = await fixture();
    const id = locked.bundle.roots[0] ?? "";
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("{}")),
    );
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: { policy, locations: { [id]: [location] }, fetch: fetcher },
      }),
    ).rejects.toThrow("denied");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("blocks redirects by default and rechecks destination origins when redirects are allowed", async () => {
    const locked = await fixture();
    const id = locked.bundle.roots[0] ?? "";
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test/stolen" },
        }),
      ),
    );
    const locations = { [id]: ["https://contracts.test/start"] };
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: { policy, locations, fetch: fetcher },
      }),
    ).rejects.toThrow("Redirect budget");
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: {
          policy: { ...policy, maxRedirects: 1 },
          locations,
          fetch: fetcher,
        },
      }),
    ).rejects.toThrow("denied");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds declared and streamed response bytes and does not cache partial failure", async () => {
    const locked = await fixture();
    const id = locked.bundle.roots[0] ?? "";
    for (const response of [
      new Response("tiny", { headers: { "content-length": "99999" } }),
      new Response("x".repeat(101)),
    ]) {
      const cache = new Map<string, unknown>();
      await expect(
        resolveContracts(locked.document.dependencies ?? [], {
          cache,
          remote: {
            policy: { ...policy, maxBytes: 100 },
            locations: { [id]: ["https://contracts.test/a"] },
            fetch: () => Promise.resolve(response),
          },
        }),
      ).rejects.toThrow();
      expect(cache.size).toBe(0);
    }
  });
  it("aborts timed-out fetches, rejects pin mismatch and invalid budgets", async () => {
    const locked = await fixture();
    const id = locked.bundle.roots[0] ?? "";
    const locations = { [id]: ["https://contracts.test/a"] };
    const stalled: typeof fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: {
          policy: { ...policy, timeoutMs: 10 },
          locations,
          fetch: stalled,
        },
      }),
    ).rejects.toThrow("timed out");
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: {
          policy: { ...policy, maxContracts: 0 },
          locations,
          fetch: stalled,
        },
      }),
    ).rejects.toThrow("budget");
    const changed = await exportBlockContract({
      ...definition(),
      type: "example:other",
    });
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: {
          policy,
          locations,
          fetch: () => Promise.resolve(new Response(canonicalizeJson(changed))),
        },
      }),
    ).rejects.toThrow("requested immutable");
  });
  it("bounds transitive dependency depth/count", async () => {
    const base = definition();
    const middle = {
      ...base,
      type: "example:middle" as const,
      contract: {
        ...base.contract,
        dependencies: [{ type: base.type, schemaVersion: 1 }],
      },
    };
    const root = {
      ...base,
      type: "example:root" as const,
      contract: {
        ...base.contract,
        dependencies: [{ type: middle.type, schemaVersion: 1 }],
      },
    };
    const bundle = await exportDocumentContracts(
      { blocks: [{ type: root.type, schemaVersion: 1 }] },
      createRegistry([base, middle, root]),
    );
    const entry = bundle.contracts.find((item) =>
      bundle.roots.includes(item.id),
    );
    if (!entry) throw new Error("Missing root.");
    const pins = [
      { ...entry.contract.identity, id: entry.id, digest: entry.digest },
    ].map(({ type, schemaVersion, id, digest }) => ({
      type,
      schemaVersion,
      id,
      digest,
    }));
    await expect(
      resolveContracts(pins, { bundle, offline: true }),
    ).resolves.toEqual(bundle);
    for (const budget of [{ maxDepth: 1 }, { maxContracts: 2 }]) {
      const cache = new Map<string, unknown>();
      await expect(
        resolveContracts(pins, {
          bundle,
          cache,
          remote: { policy: { ...policy, ...budget }, locations: {} },
        }),
      ).rejects.toThrow("depth/count");
      expect(cache.size).toBe(0);
    }
    const cache = new Map([[entry.id, entry]]);
    await expect(
      resolveContracts(pins, { cache, offline: true }),
    ).rejects.toThrow(entry.contract.dependencies[0]);
  });
  it("allows productive child recursion and reports all missing offline roots", async () => {
    const tree = defineSchemaBlock({
      type: "example:tree",
      schemaVersion: 1,
      contract: {
        ...source,
        dataSchema: {
          $id: "urn:example:tree",
          type: "object",
          properties: {
            count: { type: "integer", minimum: 0 },
            child: { $ref: "urn:example:tree" },
          },
          required: ["count"],
          additionalProperties: false,
        },
        documentation: {
          ...source.documentation,
          properties: {
            count: "Authored nonnegative count.",
            child: "Optional nested tree.",
          },
          validExamples: [
            {
              input: { count: 1, child: { count: 2 } },
              output: { count: 1, child: { count: 2 } },
            },
          ],
        },
      },
    });
    const locked = await lockDocument(
      document({
        blocks: [
          createBlock({
            type: tree.type,
            data: { count: 1, child: { count: 2 } },
          }),
          createBlock({ type: "example:counter", data: { count: 3 } }),
        ],
      }),
      createRegistry([tree, definition()]),
    );
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        bundle: locked.bundle,
        offline: true,
      }),
    ).resolves.toEqual(locked.bundle);
    try {
      await resolveContracts(locked.document.dependencies ?? [], {
        offline: true,
      });
      throw new Error("Expected missing closure.");
    } catch (error) {
      for (const pin of locked.document.dependencies ?? [])
        expect(String(error)).toContain(pin.id);
    }
  });
  it("times out even when host fetch ignores the abort signal", async () => {
    const locked = await fixture();
    const id = locked.bundle.roots[0] ?? "";
    await expect(
      resolveContracts(locked.document.dependencies ?? [], {
        remote: {
          policy: { ...policy, timeoutMs: 10 },
          locations: { [id]: ["https://contracts.test/stalled"] },
          fetch: () => new Promise(() => undefined),
        },
      }),
    ).rejects.toThrow("timed out");
  });
});
