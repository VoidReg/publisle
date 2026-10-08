import { beforeAll, afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  symlink,
  link,
  rename,
  cp,
  rm,
  mkdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createBlock, document, canonicalizeJson } from "@publisle/schema";
import { createRegistry } from "../../core/src/index.ts";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import { toMarkdown, fromMarkdown } from "../../markdown/src/index.ts";
import source from "../fixtures/portable-counter.json" with { type: "json" };
import { lockDocument } from "@publisle/contracts";
import {
  exportExchange,
  importExchange,
  validateExchangePath,
  type ExchangeManifest,
} from "@publisle/contracts/exchange";
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
let baseline: Awaited<ReturnType<typeof lockDocument>> | undefined;
let resourceBaseline: Awaited<ReturnType<typeof lockDocument>> | undefined;
beforeAll(async () => {
  const definition = defineSchemaBlock({
    type: "example:counter",
    schemaVersion: 1,
    contract: source,
  });
  baseline = await lockDocument(
    document({
      blocks: [createBlock({ type: definition.type, data: { count: 3 } })],
    }),
    createRegistry([definition]),
  );
  const resourceBlock = defineSchemaBlock({
    type: "example:resource",
    schemaVersion: 1,
    contract: source,
    traversal: {
      root: { properties: { label: { emit: { kind: "resource" } } } },
    },
  });
  resourceBaseline = await lockDocument(
    document({
      blocks: [
        createBlock({
          type: resourceBlock.type,
          data: { count: 1, label: "./missing.csv" },
        }),
      ],
    }),
    createRegistry([resourceBlock]),
  );
}, 30_000);
async function fixture() {
  if (!baseline) throw new Error("Fixture setup must complete before use.");
  const locked = structuredClone(baseline);
  const root = await mkdtemp(join(tmpdir(), "publisle-exchange-test-"));
  temporary.push(root);
  return {
    root,
    directory: join(root, "package"),
    source: locked.document,
    bundle: locked.bundle,
  };
}
const digest = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
describe("offline directory exchange", () => {
  async function resourcePackage() {
    const input = await fixture();
    if (!resourceBaseline)
      throw new Error("Resource setup must complete before use");
    const locked = structuredClone(resourceBaseline);
    const manifest = await exportExchange(input.directory, {
      source: locked.document,
      bundle: locked.bundle,
    });
    return { input, manifest };
  }
  it("enumerates omitted declared resources without losing readable source", async () => {
    const { input, manifest } = await resourcePackage();
    expect(manifest.resources).toHaveLength(1);
    expect(manifest.resources[0]).toMatchObject({
      status: "missing",
      resource: { uri: "./missing.csv" },
    });
    expect((await importExchange(input.directory)).resources.size).toBe(0);
  });
  it("rejects inventories that hide declared resources", async () => {
    const { input, manifest } = await resourcePackage();
    await writeFile(
      join(input.directory, "exchange.json"),
      canonicalizeJson({ ...manifest, resources: [] }),
    );
    await expect(importExchange(input.directory)).rejects.toThrow(
      "absent from exchange inventory",
    );
  });
  it("rejects resource cycles and honors an out-of-band inventory pin", async () => {
    const input = await fixture();
    await expect(
      exportExchange(input.directory, {
        ...input,
        resources: [
          { resource: { identity: "a", uri: "a", dependencies: ["b"] } },
          { resource: { identity: "b", uri: "b", dependencies: ["a"] } },
        ],
      }),
    ).rejects.toThrow("cycle");
    await exportExchange(input.directory, input);
    const pin = digest(await readFile(join(input.directory, "exchange.json")));
    await expect(
      importExchange(input.directory, { expectedManifestDigest: pin }),
    ).resolves.toHaveProperty("source", input.source);
    await writeFile(
      join(input.directory, "exchange.json"),
      (await readFile(join(input.directory, "exchange.json"), "utf8")) + "  ",
    );
    await expect(
      importExchange(input.directory, { expectedManifestDigest: pin }),
    ).rejects.toThrow("digest mismatch");
  });
  it("rejects hardlinked files and symlinked asset directories", async () => {
    const input = await fixture();
    await exportExchange(input.directory, {
      ...input,
      resources: [
        {
          resource: { identity: "a", uri: "a.bin" },
          bytes: new Uint8Array([1]),
        },
      ],
    });
    const sourcePath = join(input.directory, "source.json");
    const linked = join(input.root, "hardlink");
    await link(sourcePath, linked);
    await expect(importExchange(input.directory)).rejects.toThrow(
      "non-hardlinked",
    );
    await rm(linked);
    const assets = join(input.directory, "assets");
    const outside = join(input.root, "outside-assets");
    await rename(assets, outside);
    await symlink(outside, assets);
    await expect(importExchange(input.directory)).rejects.toThrow("symlink");
  });
  it("round-trips locked JSON, contracts and assets without source mutation or executable fetching", async () => {
    const input = await fixture();
    const original = canonicalizeJson(input.source);
    const bytes = new TextEncoder().encode("x,y\n1,2\n");
    const resource = {
      identity: "source-data",
      uri: "./data.csv",
      originalUris: ["./data.csv"],
      mediaType: "text/csv",
      byteDigest: digest(bytes),
      dataset: { columns: ["x", "y"], rowCount: 1 },
    };
    const manifest = await exportExchange(input.directory, {
      ...input,
      resources: [{ resource, bytes }],
    });
    const loaded = await importExchange(input.directory);
    expect(loaded.source).toEqual(input.source);
    expect(loaded.bundle).toEqual(input.bundle);
    expect(loaded.manifest).toEqual(manifest);
    expect(loaded.resources.get(resource.identity)).toEqual(bytes);
    expect(canonicalizeJson(input.source)).toBe(original);
    const copy = join(input.root, "another-machine");
    await cp(input.directory, copy, { recursive: true });
    expect((await importExchange(copy)).source).toEqual(input.source);
  });
  it("supports identity-preserving archival Markdown through an approved host codec", async () => {
    const input = await fixture();
    const markdown =
      toMarkdown(input.source, { policy: "archival" }).markdown ?? "";
    const decode = (value: string) => {
      const parsed = fromMarkdown(value).document;
      if (!parsed) throw new Error("Invalid archive.");
      return parsed;
    };
    await exportExchange(input.directory, {
      ...input,
      archival: { markdown, decode },
    });
    await expect(importExchange(input.directory)).rejects.toThrow("decoder");
    expect(
      (await importExchange(input.directory, { decodeArchival: decode }))
        .source,
    ).toEqual(input.source);
  });
  it("enumerates missing and intentionally external datasets without claiming asset/executable completeness", async () => {
    const input = await fixture();
    await exportExchange(input.directory, {
      ...input,
      resources: [
        {
          resource: {
            identity: "external",
            uri: "https://data.test/huge.bin",
            external: true,
            dataset: { byteLength: 900000000, format: "float64-le" },
          },
        },
        { resource: { identity: "missing", uri: "not-here.csv" } },
      ],
    });
    const result = await importExchange(input.directory);
    expect(result.manifest.resources.map((entry) => entry.status)).toEqual([
      "external",
      "missing",
    ]);
    expect(result.resources.size).toBe(0);
    expect(
      (await readFile(join(input.directory, "exchange.json"))).byteLength,
    ).toBeLessThan(2000);
  });
  it("deduplicates identical asset bytes while retaining distinct source descriptors", async () => {
    const input = await fixture();
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await exportExchange(input.directory, {
      ...input,
      resources: [
        { resource: { uri: "a.bin", identity: "a" }, bytes },
        { resource: { uri: "b.bin", identity: "b" }, bytes },
      ],
    });
    expect(manifest.resources[0]?.path).toBe(manifest.resources[1]?.path);
    expect((await importExchange(input.directory)).resources.size).toBe(2);
  });
  it.each([
    "/etc/passwd",
    "../escape",
    "assets/../../escape",
    "assets/./x",
    "assets//x",
    "C:/windows/file",
    "assets\\escape",
    "assets/x\0y",
    "",
  ])("rejects unsafe path %j", (path) => {
    expect(() => {
      validateExchangePath(path);
    }).toThrow("Unsafe");
  });
  it("refuses existing destinations and source/asset digest mismatches before writing", async () => {
    const input = await fixture();
    await mkdir(input.directory);
    await expect(exportExchange(input.directory, input)).rejects.toThrow();
    const invalid = join(input.root, "invalid");
    await expect(
      exportExchange(invalid, {
        ...input,
        resources: [
          {
            resource: {
              uri: "bad",
              identity: "bad",
              byteDigest: `sha256:${"0".repeat(64)}`,
            },
            bytes: new Uint8Array([1]),
          },
        ],
      }),
    ).rejects.toThrow("digest mismatch");
    await expect(readFile(join(invalid, "exchange.json"))).rejects.toThrow();
  });
  it.each(["source.json", "contracts.json", "lock.json", "asset"])(
    "detects changed %s bytes on import",
    async (target) => {
      const input = await fixture();
      const manifest = await exportExchange(input.directory, {
        ...input,
        resources: [
          {
            resource: { uri: "data.bin", identity: "data" },
            bytes: new Uint8Array([1]),
          },
        ],
      });
      const path = target === "asset" ? manifest.resources[0]?.path : target;
      if (!path) throw new Error("Missing asset.");
      await writeFile(join(input.directory, path), "tampered");
      await expect(importExchange(input.directory)).rejects.toThrow(
        "digest mismatch",
      );
    },
  );
  it("rejects symlinked roots, files and asset directories", async () => {
    const input = await fixture();
    const manifest = await exportExchange(input.directory, {
      ...input,
      resources: [
        {
          resource: { uri: "data.bin", identity: "data" },
          bytes: new Uint8Array([1]),
        },
      ],
    });
    await symlink(input.directory, join(input.root, "root-link"));
    await expect(importExchange(join(input.root, "root-link"))).rejects.toThrow(
      "real directory",
    );
    const sourcePath = join(input.directory, "source.json");
    const sourceBytes = await readFile(sourcePath);
    await rm(sourcePath);
    const external = join(input.root, "outside.json");
    await writeFile(external, sourceBytes);
    await symlink(external, sourcePath);
    await expect(importExchange(input.directory)).rejects.toThrow("symlink");
    expect(manifest.resources).toHaveLength(1);
  });
  it("rejects injected traversal paths and enforces aggregate/file/count budgets", async () => {
    const input = await fixture();
    const manifest = await exportExchange(input.directory, input);
    await expect(
      importExchange(input.directory, { limits: { maxFiles: 1 } }),
    ).rejects.toThrow("count");
    await expect(
      importExchange(input.directory, { limits: { maxTotalBytes: 100 } }),
    ).rejects.toThrow("budget");
    await writeFile(
      join(input.directory, "exchange.json"),
      canonicalizeJson({
        ...manifest,
        source: { ...manifest.source, path: "../outside" },
      }),
    );
    await expect(importExchange(input.directory)).rejects.toThrow("Unsafe");
    await expect(
      exportExchange(join(input.root, "too-small"), input, { maxFileBytes: 1 }),
    ).rejects.toThrow("budget");
  });
  it("rejects duplicate/misleading resource entries and lock replacement", async () => {
    const input = await fixture();
    const manifest = await exportExchange(input.directory, input);
    const forged: ExchangeManifest = {
      ...manifest,
      resources: [
        {
          resource: { uri: "fake", identity: "x" },
          status: "external",
          path: "source.json",
        },
      ],
    };
    await writeFile(
      join(input.directory, "exchange.json"),
      canonicalizeJson(forged),
    );
    await expect(importExchange(input.directory)).rejects.toThrow("disguise");
  });
});
