import { describe, expect, it, vi } from "vitest";
import { coreBlockDefinitions, paragraph } from "@publisle/blocks-core";
import {
  createBlock,
  document,
  type PublicationProfile,
  type DiagnosticPolicy,
} from "@publisle/schema";
import { researchPaperProfile } from "../../profiles/src/index.ts";
import { assertPrepared, createRegistry, prepare } from "../src/index.ts";

const registry = createRegistry(coreBlockDefinitions);
const input = () =>
  document({
    metadata: { title: "A paper" },
    blocks: [paragraph({ content: [{ type: "text", value: "Body" }] })],
  });
const profile: PublicationProfile = {
  name: "example",
  version: "1",
  inspect(doc) {
    return [
      {
        level: "warning",
        code: "missing-abstract",
        message: "No abstract.",
        blockId: doc.blocks[0]!.id,
      },
    ];
  },
};

describe("preparation profiles", () => {
  it("rejects invalid host policy levels instead of silently accepting them", () => {
    const diagnosticPolicy = JSON.parse(
      '{"missing-abstract":"ignore"}',
    ) as DiagnosticPolicy;
    const result = prepare(input(), {
      registry,
      profiles: [profile],
      diagnosticPolicy,
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "invalid-diagnostic-policy",
        level: "error",
      }),
    ]);
  });

  it("ignores inherited properties when matching diagnostic policy codes", () => {
    const result = prepare(input(), {
      registry,
      profiles: [
        {
          name: "prototype-code",
          inspect: () => [
            {
              level: "warning",
              code: "toString",
              message: "Safe code lookup.",
            },
          ],
        },
      ],
      diagnosticPolicy: {},
    });
    expect(result.document).toBeDefined();
    expect(result.diagnostics[0]?.level).toBe("warning");
  });

  it("reports attempted snapshot mutation and leaves original data unchanged", () => {
    const doc = input();
    const result = prepare(doc, {
      registry,
      profiles: [
        {
          name: "mutating",
          inspect(snapshot) {
            snapshot.metadata!.title = "Changed";
            return [];
          },
        },
      ],
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "profile-inspection-failed",
        profile: "mutating",
      }),
    );
    expect(doc.metadata?.title).toBe("A paper");
  });

  it("keeps profiles opt-in and accepts conformance warnings without changing semantic output", () => {
    const doc = input();
    const plain = prepare(doc, { registry });
    expect(plain.diagnostics).toEqual([]);
    const result = prepare(doc, {
      registry,
      profiles: [researchPaperProfile()],
    });
    expect(result.document?.blocks).toEqual(plain.document?.blocks);
    expect(result.document?.metadata).toEqual(plain.document?.metadata);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-abstract",
          level: "warning",
          profile: "research-paper",
        }),
        expect.objectContaining({
          code: "missing-authors",
          level: "warning",
          profile: "research-paper",
        }),
      ]),
    );
    expect(() => assertPrepared(result)).not.toThrow();
  });

  it.each(["info", "warning", "error"] as const)(
    "applies a %s override only to profile diagnostics",
    (level) => {
      const doc = input();
      const result = prepare(doc, {
        registry,
        profiles: [profile],
        diagnosticPolicy: { "missing-abstract": level },
      });
      expect(result.diagnostics).toEqual([
        {
          level,
          code: "missing-abstract",
          message: "No abstract.",
          blockId: doc.blocks[0]?.id,
          profile: "example",
        },
      ]);
      expect(result.document !== undefined).toBe(level !== "error");
      if (level === "error")
        expect(() => assertPrepared(result)).toThrow("No abstract.");
    },
  );

  it("can downgrade a profile error without weakening structural validation", () => {
    const errorProfile: PublicationProfile = {
      name: "strict-profile",
      inspect: () => [
        {
          level: "error",
          code: "publication-rule",
          message: "Publication rule.",
        },
      ],
    };
    expect(
      prepare(input(), {
        registry,
        profiles: [errorProfile],
        diagnosticPolicy: { "publication-rule": "info" },
      }).document,
    ).toBeDefined();
    const block = input().blocks[0]!;
    const inspect = vi.fn(
      (snapshot: Parameters<PublicationProfile["inspect"]>[0]) =>
        profile.inspect(snapshot),
    );
    const result = prepare(document({ blocks: [block, block] }), {
      registry,
      profiles: [{ ...profile, inspect }],
      diagnosticPolicy: { "duplicate-block-id": "info" },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "duplicate-block-id", level: "error" }),
    );
    expect(inspect).not.toHaveBeenCalled();
  });

  it("inspects migrated and normalized data instead of the persisted source payload", () => {
    const doc = document({
      blocks: [
        createBlock({
          type: "test:normalized",
          schemaVersion: 1,
          data: { old: "value" },
        }),
      ],
    });
    const localRegistry = createRegistry([
      {
        type: "test:normalized",
        schemaVersion: 2,
        migrations: [{ from: 1, migrate: () => ({ value: "migrated" }) }],
        schema: { parse: () => ({ value: "parsed" }) },
        normalize: () => ({ value: "normalized" }),
      },
    ]);
    const inspector: PublicationProfile = {
      name: "normalized",
      inspect(snapshot) {
        expect(snapshot.blocks[0]).toMatchObject({
          schemaVersion: 2,
          data: { value: "normalized" },
        });
        expect(snapshot.blocks[0]).not.toHaveProperty("prepared");
        return [];
      },
    };
    expect(
      prepare(doc, { registry: localRegistry, profiles: [inspector] })
        .diagnostics,
    ).toEqual([]);
    expect(doc.blocks[0]?.data).toEqual({ old: "value" });
  });

  it("isolates and deeply freezes each profile snapshot without freezing source/output", () => {
    const doc = input();
    const original = structuredClone(doc);
    const snapshots: unknown[] = [];
    const inspector: PublicationProfile = {
      name: "snapshot",
      inspect(snapshot) {
        snapshots.push(snapshot);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.blocks[0]?.data)).toBe(true);
        expect(Reflect.set(snapshot.metadata!, "title", "Changed")).toBe(false);
        expect(snapshot.metadata?.title).toBe("A paper");
        return [];
      },
    };
    const result = prepare(doc, {
      registry,
      profiles: [inspector, { ...inspector, name: "second" }],
    });
    expect(result.diagnostics).toEqual([]);
    expect(snapshots[0]).not.toBe(snapshots[1]);
    expect(doc).toEqual(original);
    expect(Object.isFrozen(doc.metadata)).toBe(false);
    expect(result.document?.metadata).toEqual(original.metadata);
  });

  it("retains diagnostic locations and attributes provenance without mutating returned diagnostics", () => {
    const diagnostic = Object.freeze({
      level: "warning" as const,
      code: "custom",
      message: "Message",
      sourceLocation: { source: "article.md", line: 3, column: 2 },
    });
    const result = prepare(input(), {
      registry,
      profiles: [{ name: "location", inspect: () => [diagnostic] }],
      diagnosticPolicy: { custom: "info" },
    });
    expect(result.diagnostics[0]).toEqual({
      ...diagnostic,
      level: "info",
      profile: "location",
    });
    expect(diagnostic.level).toBe("warning");
  });

  it("reports inspector failures without throwing, losing other diagnostics, or allowing policy suppression", () => {
    const result = prepare(input(), {
      registry,
      profiles: [
        {
          name: "broken",
          inspect() {
            throw new Error("Inspector failed");
          },
        },
        profile,
      ],
      diagnosticPolicy: { "profile-inspection-failed": "info" },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "profile-inspection-failed",
        profile: "broken",
        level: "error",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-abstract", profile: "example" }),
    );
  });

  it("includes profile versions and diagnostic policy in deterministic cache identity", () => {
    const doc = input();
    const options = {
      registry,
      profiles: [profile],
      diagnosticPolicy: { "missing-abstract": "info" as const },
    };
    const first = prepare(doc, options).document!.cacheIdentity;
    expect(prepare(doc, options).document!.cacheIdentity).toBe(first);
    expect(
      prepare(doc, { ...options, profiles: [{ ...profile, version: "2" }] })
        .document!.cacheIdentity,
    ).not.toBe(first);
    expect(
      prepare(doc, {
        ...options,
        diagnosticPolicy: { "missing-abstract": "warning" },
      }).document!.cacheIdentity,
    ).not.toBe(first);
    expect(prepare(doc, { registry }).document!.cacheIdentity).not.toBe(first);
  });
});
