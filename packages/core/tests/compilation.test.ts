import { coreBlockDefinitions } from "@publisle/blocks-core";
import {
  createBlock,
  document,
  type BlockId,
  type Document,
} from "@publisle/schema";
import { describe, expect, it } from "vitest";
import {
  CompilationCacheError,
  compileCorpus,
  createCompilationCache,
  createRegistry,
  prepare,
} from "../src/index.ts";

const registry = createRegistry(coreBlockDefinitions);
const left = "11111111-1111-4111-8111-111111111111";
const right = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";
const fourth = "44444444-4444-4444-8444-444444444444";

function article(id: string, text: string): Document {
  return document({
    blocks: [
      createBlock({
        id: id as BlockId,
        type: "publisle:paragraph",
        data: { content: [{ type: "text", value: text }] },
      }),
    ],
  });
}

describe("compileCorpus", () => {
  it("reuses unchanged documents and rebuilds only the edited one", async () => {
    const cache = createCompilationCache();
    const prepared: string[] = [];
    const first = await compileCorpus({
      registry,
      cache,
      documents: [
        { key: "a", document: article(left, "Alpha") },
        { key: "b", document: article(right, "Beta") },
      ],
      onPrepare: (key) => prepared.push(key),
      compile: (_document, key) => ({ html: key, modules: [{ id: "reader" }] }),
    });
    expect(first.documents.map((entry) => entry.status)).toEqual([
      "rebuilt",
      "rebuilt",
    ]);
    expect(first.shared.modules).toEqual(["reader"]);
    expect(cache.has("module:reader")).toBe(true);
    const identityB = first.documents[1]?.outputIdentity;
    prepared.length = 0;
    const second = await compileCorpus({
      registry,
      cache,
      documents: [
        { key: "a", document: article(left, "Alpha edited") },
        { key: "b", document: article(right, "Beta") },
      ],
      onPrepare: (key) => prepared.push(key),
    });
    expect(prepared).toEqual(["a"]);
    expect(second.documents.map((entry) => entry.status)).toEqual([
      "rebuilt",
      "reused",
    ]);
    expect(second.documents[1]?.outputIdentity).toBe(identityB);
    expect(second.documents[0]?.prepared).toEqual(
      prepare(article(left, "Alpha edited"), { registry }).document,
    );
    expect(second.documents[1]?.prepared).toEqual(
      prepare(article(right, "Beta"), { registry }).document,
    );
  });

  it("invalidates only documents that share a changed contract or resource", async () => {
    const cache = createCompilationCache();
    const documents = [
      {
        key: "a",
        document: article(left, "Alpha"),
        contracts: ["c1"],
        resources: ["r1"],
      },
      { key: "b", document: article(right, "Beta"), contracts: ["c1"] },
      { key: "d", document: article(third, "Delta") },
    ];
    const first = await compileCorpus({
      registry,
      cache,
      documents,
      contracts: [{ id: "c1", payload: { text: "one" } }],
      resources: [{ id: "r1", payload: { bytes: "img" } }],
    });
    expect(first.shared.contracts).toEqual(["c1"]);
    expect(first.shared.resources).toEqual(["r1"]);
    const stableD = first.documents[2]?.outputIdentity;
    const next = await compileCorpus({
      registry,
      cache,
      documents: [
        {
          key: "a",
          document: article(left, "Alpha"),
          contracts: ["c2"],
          resources: ["r2"],
        },
        { key: "b", document: article(right, "Beta"), contracts: ["c2"] },
        { key: "d", document: article(third, "Delta") },
      ],
      contracts: [
        { id: "c1", payload: { text: "one" } },
        { id: "c2", payload: { text: "two" } },
      ],
      resources: [
        { id: "r1", payload: { bytes: "img" } },
        { id: "r2", payload: { bytes: "next" } },
      ],
    });
    expect(next.documents.map((entry) => entry.status)).toEqual([
      "rebuilt",
      "rebuilt",
      "reused",
    ]);
    expect(next.documents[2]?.outputIdentity).toBe(stableD);
    expect(next.shared.contracts).toEqual(["c1", "c2"]);
  });

  it("rejects a rewritten cache entry and conflicting shared content", async () => {
    const cache = createCompilationCache();
    await compileCorpus({
      registry,
      cache,
      documents: [
        { key: "a", document: article(left, "Alpha"), contracts: ["c1"] },
      ],
      contracts: [{ id: "c1", payload: { text: "one" } }],
    });
    const stored = cache.get("document:a") as {
      payload: { prepared: Document };
    };
    stored.payload.prepared = article(left, "forged");
    await expect(
      compileCorpus({
        registry,
        cache,
        documents: [
          { key: "a", document: article(left, "Alpha"), contracts: ["c1"] },
        ],
        contracts: [{ id: "c1", payload: { text: "one" } }],
      }),
    ).rejects.toMatchObject({ code: "tampered-cache" });
    await expect(
      compileCorpus({
        registry,
        cache: createCompilationCache(),
        documents: [
          { key: "a", document: article(left, "Alpha"), contracts: ["c1"] },
        ],
        contracts: [
          { id: "c1", payload: { text: "one" } },
          { id: "c1", payload: { text: "other" } },
        ],
      }),
    ).rejects.toBeInstanceOf(CompilationCacheError);
  });

  it("keeps an invalid document from discarding its neighbors", async () => {
    const prepared: string[] = [];
    const result = await compileCorpus({
      registry,
      cache: createCompilationCache(),
      documents: [
        {
          key: "bad",
          document: { schemaVersion: 2, blocks: [] },
          contracts: ["missing"],
        },
        { key: "ok", document: article(fourth, "Kept") },
      ],
      onPrepare: (key) => prepared.push(key),
    });
    expect(result.documents[0]).toMatchObject({
      status: "invalid",
      diagnostics: [
        expect.objectContaining({ code: "missing-shared-dependency" }),
      ],
    });
    expect(prepared).toEqual(["ok"]);
    expect(result.documents[1]?.status).toBe("rebuilt");
  });

  it("bounds how many documents are compiled at once", async () => {
    let active = 0;
    let max = 0;
    const hold = Promise.withResolvers<boolean>();
    const running = compileCorpus({
      registry,
      cache: createCompilationCache(),
      concurrency: 2,
      documents: [left, right, third, fourth].map((id, index) => ({
        key: String(index),
        document: article(id, String(index)),
      })),
      compile: async () => {
        active += 1;
        max = Math.max(max, active);
        await hold.promise;
        active -= 1;
        return { modules: [{ id: "shared-module" }] };
      },
    });
    await waitUntil(() => active === 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(max).toBe(2);
    expect(active).toBe(2);
    hold.resolve(true);
    const result = await running;
    expect(result.shared.modules).toEqual(["shared-module"]);
    await expect(
      compileCorpus({
        registry,
        cache: createCompilationCache(),
        concurrency: 0,
        documents: [],
      }),
    ).rejects.toMatchObject({ code: "invalid-cache" });
  });
});

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out waiting for bounded compilation");
}
