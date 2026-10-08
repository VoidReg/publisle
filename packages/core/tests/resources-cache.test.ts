import { describe, expect, it, vi } from "vitest";
import { coreBlockDefinitions, figure } from "@publisle/blocks-core";
import {
  createBlock,
  document,
  type ResourceReference,
  type PublicationProfile,
} from "@publisle/schema";
import {
  createRegistry,
  prepare,
  type PortableBlockDefinition,
  type ResourceResolver,
} from "../src/index.ts";
import { fromMarkdown } from "../../markdown/src/index.ts";

const definition: PortableBlockDefinition<
  "test:resources",
  { refs: readonly ResourceReference[] }
> = {
  type: "test:resources",
  schemaVersion: 1,
  schema: { parse: (value) => value as { refs: readonly ResourceReference[] } },
  resources: (data) => data.refs,
};
const registry = createRegistry([definition, ...coreBlockDefinitions]);
const inputFor = (...refs: ResourceReference[]) =>
  document({
    blocks: [createBlock({ type: definition.type, data: { refs } })],
  });
const resolver = (version = "content-1"): ResourceResolver => ({
  version: "resolver-1",
  resolve: () => ({ version }),
});

describe("resource resolution and cache identity", () => {
  it("preserves original aliases, host source bases, exact byte pins and external dataset metadata", () => {
    const input = inputFor({ uri: "./data.csv" }, { uri: "data.csv" });
    const byteDigest = `sha256:${"a".repeat(64)}` as const;
    const host: ResourceResolver = {
      version: "resolver-1",
      base: "https://example.test/article/",
      resolve: ({ uri }) => ({
        version: "revision-1",
        resolvedLocation: new URL(uri, "https://example.test/article/").href,
        mediaType: "text/csv",
        byteDigest,
        external: true,
        dataset: { columns: ["x", "y"] },
      }),
    };
    const result = prepare(input, {
      registry,
      resourceResolver: host,
    }).document!;
    expect(result.resources.resources).toHaveLength(1);
    expect(result.resources.resources[0]).toMatchObject({
      uri: "data.csv",
      originalUris: ["./data.csv", "data.csv"],
      resolvedLocation: "https://example.test/article/data.csv",
      byteDigest,
      external: true,
      dataset: { columns: ["x", "y"] },
    });
    const other = prepare(input, {
      registry,
      resourceResolver: { ...host, base: "https://example.test/other/" },
    }).document!;
    expect(other.resources.resources[0]?.identity).not.toBe(
      result.resources.resources[0]?.identity,
    );
    expect(input.blocks[0]?.data).toEqual({
      refs: [{ uri: "./data.csv" }, { uri: "data.csv" }],
    });
  });
  it("reports throwing resource extraction and invalid declaration lists safely", () => {
    const throwing = prepare(inputFor(), {
      registry: createRegistry([
        {
          ...definition,
          resources() {
            throw new Error("Extraction failed");
          },
        },
      ]),
    });
    expect(throwing.document).toBeUndefined();
    expect(throwing.diagnostics[0]?.code).toBe("resource-analysis-failed");
    const invalid = prepare(inputFor(), {
      registry: createRegistry([
        {
          ...definition,
          resources: () => "bad" as unknown as readonly ResourceReference[],
        },
      ]),
    });
    expect(invalid.diagnostics[0]?.code).toBe("invalid-resource");
  });

  it("does not hash function source and relies on explicit behavior versions", () => {
    const first = createRegistry([
      { ...definition, normalize: (data) => data },
    ]);
    const second = createRegistry([
      { ...definition, normalize: (data) => structuredClone(data) },
    ]);
    expect(first.version).toBe(second.version);
    expect(
      createRegistry([definition], { preparationVersion: "2" }).version,
    ).not.toBe(first.version);
  });

  it("rejects cyclic plugin-generated transform options with an actionable resource error", () => {
    const options: Record<string, unknown> = {};
    options["cycle"] = options;
    const ref = {
      uri: "wave.svg",
      transform: "svg",
      options,
    } as unknown as ResourceReference;
    const result = prepare(inputFor(), {
      registry: createRegistry([{ ...definition, resources: () => [ref] }]),
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("invalid-resource");
  });

  it("deduplicates equivalent paths and resolves a source once across blocks and transforms", () => {
    const resolve = vi.fn(() => ({ version: "hash-1" }));
    const input = document({
      blocks: [
        figure({ src: "./data/../wave.svg", alt: "Wave" }),
        createBlock({
          type: definition.type,
          data: {
            refs: [
              {
                uri: "wave.svg",
                transform: "thumbnail@1",
                options: { width: 100 },
              },
              {
                uri: "./wave.svg",
                transform: "print@1",
                options: { dpi: 300 },
              },
              {
                uri: "wave.svg",
                transform: "thumbnail@1",
                options: { width: 100 },
              },
            ],
          },
        }),
      ],
    });
    const original = structuredClone(input);
    const result = prepare(input, {
      registry,
      resourceResolver: { version: "1", resolve },
    });
    expect(result.diagnostics).toEqual([]);
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ uri: "wave.svg" });
    expect(result.document!.resources.resources).toHaveLength(1);
    const source = result.document!.resources.resources[0]!;
    expect(source).toMatchObject({
      uri: "wave.svg",
      version: "hash-1",
      dependencies: [],
    });
    expect(source).not.toHaveProperty("transform");
    const artifacts = result.document!.resources.artifacts!;
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.identity).not.toBe(artifacts[1]!.identity);
    expect(
      artifacts.every(
        (artifact) => artifact.sourceIdentity === source.identity,
      ),
    ).toBe(true);
    expect(input).toEqual(original);
  });

  it("deduplicates resolver aliases with the same canonical URI/revision", () => {
    const result = prepare(inputFor({ uri: "alias-a" }, { uri: "alias-b" }), {
      registry,
      resourceResolver: {
        version: "1",
        resolve: () => ({ uri: "/assets/wave.svg", version: "hash" }),
      },
    });
    expect(result.document!.resources.resources).toHaveLength(1);
    expect(result.document!.resources.resources[0]?.uri).toBe(
      "/assets/wave.svg",
    );
  });

  it("rejects conflicting canonical revisions", () => {
    const result = prepare(inputFor({ uri: "a" }, { uri: "b" }), {
      registry,
      resourceResolver: {
        version: "1",
        resolve: ({ uri }) => ({ uri: "shared", version: uri }),
      },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("resource-resolution-conflict");
  });

  it("resolves transitive dependencies once and invalidates parent artifacts when a dependency changes", () => {
    const input = inputFor(
      { uri: "scene", transform: "svg@1" },
      { uri: "shared" },
    );
    const prepareGraph = (leafVersion: string) => {
      const resolve = vi.fn(({ uri }: { uri: string }) => ({
        version: uri === "shared" ? leafVersion : "1",
        dependencies:
          uri === "scene"
            ? [{ uri: "material" }, { uri: "./shared" }]
            : uri === "material"
              ? [{ uri: "shared" }]
              : [],
      }));
      const prepared = prepare(input, {
        registry,
        resourceResolver: { version: "1", resolve },
      }).document!;
      return { prepared, resolve };
    };
    const first = prepareGraph("1");
    const second = prepareGraph("2");
    expect(first.resolve).toHaveBeenCalledTimes(3);
    const sources = first.prepared.resources.resources;
    const shared = sources.find(({ uri }) => uri === "shared")!;
    const material = sources.find(({ uri }) => uri === "material")!;
    const scene = sources.find(({ uri }) => uri === "scene")!;
    expect(material.dependencies).toEqual([shared.identity]);
    expect(scene.dependencies).toEqual(
      [material.identity, shared.identity].sort(),
    );
    expect(first.prepared.cacheIdentity).not.toBe(
      second.prepared.cacheIdentity,
    );
    expect(first.prepared.resources.artifacts![0]?.identity).not.toBe(
      second.prepared.resources.artifacts![0]?.identity,
    );
  });

  it("normalizes dependency ordering and duplicates for stable identity", () => {
    const input = inputFor({ uri: "parent" });
    const result = (dependencies: string[]) =>
      prepare(input, {
        registry,
        resourceResolver: {
          version: "1",
          resolve: ({ uri }) => ({
            version: "1",
            dependencies:
              uri === "parent" ? dependencies.map((uri) => ({ uri })) : [],
          }),
        },
      }).document!;
    expect(result(["a", "b", "a"])).toEqual(result(["b", "a"]));
  });

  it("reports missing resources once per referring block with original source locations", () => {
    const imported = fromMarkdown(
      ':::figure{src="missing.svg"}\n:::\n\n:::figure{src="./missing.svg"}\n:::\n',
      { sourceName: "article.md" },
    );
    const resolve = vi.fn(() => undefined);
    const result = prepare(imported.document!, {
      registry,
      sourceMap: imported.sourceMap!,
      resourceResolver: { version: "1", resolve },
      diagnosticPolicy: { "missing-resource": "info" },
    });
    expect(result.document).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toMatchObject({
      code: "missing-resource",
      level: "error",
      blockId: imported.document!.blocks[0]?.id,
      sourceLocation: { source: "article.md", line: 1 },
    });
    expect(result.diagnostics[1]).toMatchObject({
      code: "missing-resource",
      blockId: imported.document!.blocks[1]?.id,
      sourceLocation: { line: 4 },
    });
  });

  it("reports missing transitive dependencies at the owning block", () => {
    const input = inputFor({ uri: "parent" });
    const result = prepare(input, {
      registry,
      resourceResolver: {
        version: "1",
        resolve: ({ uri }) =>
          uri === "parent"
            ? { version: "1", dependencies: [{ uri: "lost" }] }
            : undefined,
      },
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: "missing-resource",
      blockId: input.blocks[0]?.id,
    });
    expect(result.diagnostics[0]?.message).toContain("lost");
  });

  it("reports resolver exceptions separately from block validation", () => {
    const result = prepare(inputFor({ uri: "wave.svg" }), {
      registry,
      resourceResolver: {
        version: "1",
        resolve() {
          throw new Error("Storage unavailable");
        },
      },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("resource-resolution-failed");
    expect(result.diagnostics[0]?.message).toContain("Storage unavailable");
  });

  it("rejects dependency cycles without hanging", () => {
    const result = prepare(inputFor({ uri: "a" }), {
      registry,
      resourceResolver: {
        version: "1",
        resolve: ({ uri }) => ({
          version: "1",
          dependencies: [{ uri: uri === "a" ? "b" : "a" }],
        }),
      },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("resource-dependency-cycle");
  });

  it.each(
    [
      { version: "" },
      { version: "1", dependencies: "bad" },
      { version: "1", dependencies: [{ uri: "a", transform: "svg" }] },
      { version: "1", uri: "" },
      null,
      Promise.resolve({ version: "1" }),
    ].map((value) => ({ value })),
  )("rejects invalid resolver result $value", ({ value }) => {
    const hostResolver = {
      version: "1",
      resolve: () => value,
    } as unknown as ResourceResolver;
    const result = prepare(inputFor({ uri: "wave.svg" }), {
      registry,
      resourceResolver: hostResolver,
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("invalid-resource");
  });

  it.each([
    { uri: "" },
    { uri: "wave.svg", transform: "" },
    { uri: "wave.svg", options: {} },
    { uri: "wave.svg", transform: "svg", options: Number.NaN },
  ])("rejects invalid resource references %j", (ref) => {
    const result = prepare(inputFor(), {
      registry: createRegistry([{ ...definition, resources: () => [ref] }]),
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("invalid-resource");
  });

  it("retains unchecked planning without a resolver, including correct roots and parent paths", () => {
    const input = inputFor(
      { uri: "../wave.svg" },
      { uri: "/wave.svg" },
      { uri: "wave.svg" },
      { uri: "https://host/a/../wave.svg" },
    );
    const result = prepare(input, { registry });
    expect(result.diagnostics).toEqual([]);
    expect(
      result.document!.resources.resources.map(({ uri }) => uri).sort(),
    ).toEqual([
      "../wave.svg",
      "/wave.svg",
      "https://host/a/../wave.svg",
      "wave.svg",
    ]);
    expect(
      result.document!.resources.resources.every(
        (source) => source.version === undefined,
      ),
    ).toBe(true);
  });

  it("changes cache identity for document content, registry behavior, resource revision, and transform options", () => {
    const input = inputFor({
      uri: "wave.svg",
      transform: "thumb@1",
      options: { width: 100 },
    });
    const base = prepare(input, {
      registry,
      resourceResolver: resolver(),
    }).document!;
    const changedContent = structuredClone(input);
    changedContent.metadata = { title: "New title" };
    expect(
      prepare(changedContent, { registry, resourceResolver: resolver() })
        .document!.cacheIdentity,
    ).not.toBe(base.cacheIdentity);
    expect(
      prepare(input, {
        registry: createRegistry([definition, ...coreBlockDefinitions], {
          preparationVersion: "2",
        }),
        resourceResolver: resolver(),
      }).document!.cacheIdentity,
    ).not.toBe(base.cacheIdentity);
    const changedResource = prepare(input, {
      registry,
      resourceResolver: resolver("content-2"),
    }).document!;
    expect(changedResource.cacheIdentity).not.toBe(base.cacheIdentity);
    expect(changedResource.resources.artifacts![0]?.identity).not.toBe(
      base.resources.artifacts![0]?.identity,
    );
    const changedOptions = structuredClone(input);
    changedOptions.blocks[0]!.data = {
      refs: [
        { uri: "wave.svg", transform: "thumb@1", options: { width: 200 } },
      ],
    };
    const changedTransform = prepare(changedOptions, {
      registry,
      resourceResolver: resolver(),
    }).document!;
    expect(changedTransform.cacheIdentity).not.toBe(base.cacheIdentity);
    expect(changedTransform.resources.resources).toEqual(
      base.resources.resources,
    );
    expect(changedTransform.resources.artifacts).not.toEqual(
      base.resources.artifacts,
    );
  });

  it("includes preparation, resolver, profile, policy and unknown-block options but excludes source-map locations from semantic cache identity", () => {
    const input = inputFor({ uri: "wave.svg" });
    const base = prepare(input, { registry, resourceResolver: resolver() })
      .document!.cacheIdentity;
    const profile: PublicationProfile = {
      name: "custom",
      version: "1",
      inspect: () => [],
    };
    for (const options of [
      { preparationVersion: "2" },
      { resourceResolver: { ...resolver(), version: "2" } },
      { profiles: [profile] },
      { diagnosticPolicy: { a: "info" as const } },
      { unknownBlocks: "error" as const },
    ])
      expect(
        prepare(input, { registry, resourceResolver: resolver(), ...options })
          .document!.cacheIdentity,
      ).not.toBe(base);
    const located = prepare(input, {
      registry,
      resourceResolver: resolver(),
      sourceMap: {
        blocks: {},
        document: { source: "article.md", line: 9, column: 3 },
      },
    }).document!;
    expect(located.cacheIdentity).toBe(base);
    expect(located.diagnosticIdentity).not.toBe(
      prepare(input, { registry, resourceResolver: resolver() }).document!
        .diagnosticIdentity,
    );
    expect(
      prepare(input, { registry, profiles: [profile] }).document!.cacheIdentity,
    ).not.toBe(
      prepare(input, { registry, profiles: [{ ...profile, version: "2" }] })
        .document!.cacheIdentity,
    );
  });

  it("is stable for registry order, explicit defaults, and JSON object-key ordering", () => {
    const input = inputFor({
      uri: "wave.svg",
      transform: "svg",
      options: { a: 1, b: 2 },
    });
    const equivalent = structuredClone(input);
    equivalent.blocks[0]!.data = {
      refs: [{ uri: "wave.svg", transform: "svg", options: { b: 2, a: 1 } }],
    };
    const a = prepare(input, {
      registry,
      diagnosticPolicy: { a: "info", b: "warning" },
    }).document!;
    const b = prepare(equivalent, {
      registry: createRegistry([...coreBlockDefinitions, definition]),
      unknownBlocks: "preserve",
      preparationVersion: "1",
      diagnosticPolicy: { b: "warning", a: "info" },
    }).document!;
    expect(a.cacheIdentity).toBe(b.cacheIdentity);
    expect(a.resources).toEqual(b.resources);
  });

  it("isolates artifact options from subsequent source mutations", () => {
    const options = { width: 100 };
    const input = inputFor({ uri: "wave.svg", transform: "thumb", options });
    const result = prepare(input, { registry }).document!;
    options.width = 200;
    expect(result.resources.artifacts![0]?.options).toEqual({ width: 100 });
  });

  it("requires nonempty declared versions even on empty documents", () => {
    expect(() => createRegistry([], { preparationVersion: "" })).toThrow();
    expect(
      prepare(document({ blocks: [] }), { registry, preparationVersion: "" })
        .diagnostics[0]?.code,
    ).toBe("invalid-preparation-options");
    expect(
      prepare(document({ blocks: [] }), {
        registry,
        resourceResolver: { ...resolver(), version: "" },
      }).diagnostics[0]?.code,
    ).toBe("invalid-preparation-options");
  });
});
