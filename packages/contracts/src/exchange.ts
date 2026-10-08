import { constants } from "node:fs";
import { mkdir, open, lstat, realpath } from "node:fs/promises";
import { join, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import {
  parseJson,
  canonicalizeJson,
  isPlainObject,
  traverseDeclared,
  type Document,
  type JsonValue,
  type PlannedResource,
} from "@publisle/schema";
import { validateContractBundle, type ContractBundle } from "./export.ts";
import { validateLockedDocument } from "./resolution.ts";

export interface ExchangeResource {
  readonly resource: PlannedResource;
  /** Only caller-permitted bytes. The packager never fetches a URI or executable. */
  readonly bytes?: Uint8Array;
}
export interface ExchangeManifest {
  readonly format: "publisle:exchange";
  readonly formatVersion: 1;
  readonly source: {
    readonly path: string;
    readonly digest: string;
    readonly format: "json" | "archival-markdown";
  };
  readonly contracts: { readonly path: string; readonly digest: string };
  readonly lock: { readonly path: string; readonly digest: string };
  readonly resources: readonly {
    readonly resource: PlannedResource;
    readonly status: "included" | "external" | "missing";
    readonly path?: string;
    readonly byteDigest?: string;
  }[];
  readonly executableRequirements: readonly {
    readonly type: string;
    readonly hooks: readonly string[];
  }[];
}
export interface ExchangeLimits {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalBytes?: number;
}
const byteDigest = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const encode = (value: unknown) =>
  new TextEncoder().encode(canonicalizeJson(value) + "\n");
function checkedLimit(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (
    !Number.isSafeInteger(result) ||
    result < 1 ||
    result > 1024 * 1024 * 1024
  )
    throw new Error("Invalid exchange budget.");
  return result;
}
export function validateExchangePath(path: string): void {
  if (
    !path ||
    path.length > 240 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.includes(":") ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    Array.from(path).some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("Unsafe exchange path.");
}

/** New directory only. Never overwrite existing source, recursively delete data, or fetch assets. */
export async function exportExchange(
  directory: string,
  input: {
    readonly source: Document;
    readonly bundle: ContractBundle;
    readonly resources?: readonly ExchangeResource[];
    readonly archival?: {
      readonly markdown: string;
      readonly decode: (source: string) => Document;
    };
  },
  limits: ExchangeLimits = {},
): Promise<ExchangeManifest> {
  const source = await validateLockedDocument(input.source, input.bundle);
  const bundle = await validateContractBundle(input.bundle);
  const sourceBytes = input.archival
    ? new TextEncoder().encode(input.archival.markdown)
    : encode(source);
  if (
    input.archival &&
    canonicalizeJson(input.archival.decode(input.archival.markdown)) !==
      canonicalizeJson(source)
  )
    throw new Error("Archival Markdown must preserve the exact locked source.");
  const sourcePath = input.archival ? "source.md" : "source.json";
  const files = new Map<string, Uint8Array>([
    [sourcePath, sourceBytes],
    ["contracts.json", encode(bundle)],
    ["lock.json", encode(bundle.lock)],
  ]);
  const resources: ExchangeManifest["resources"][number][] = [];
  const identities = new Set<string>();
  for (const { resource, bytes } of input.resources ?? []) {
    if (identities.has(resource.identity))
      throw new Error("Duplicate resource identity.");
    identities.add(resource.identity);
    canonicalizeJson(resource);
    if (bytes !== undefined) {
      const digest = byteDigest(bytes);
      if (resource.byteDigest !== undefined && resource.byteDigest !== digest)
        throw new Error("Resource byte digest mismatch.");
      const path = `assets/${digest.slice("sha256:".length)}.bin`;
      files.set(path, Uint8Array.from(bytes));
      resources.push({
        resource,
        status: "included",
        path,
        byteDigest: digest,
      });
    } else
      resources.push({
        resource,
        status: resource.external ? "external" : "missing",
      });
  }
  // Enumerate declared URI references even when the host did not permit/provide their bytes.
  for (const block of source.blocks) {
    const contract = bundle.contracts.find(
      (entry) =>
        entry.contract.identity.type === block.type &&
        entry.contract.identity.schemaVersion === block.schemaVersion,
    );
    if (!contract?.contract.traversal) continue;
    for (const visit of traverseDeclared(
      block.data,
      contract.contract.traversal,
    )) {
      if (visit.kind !== "resource" || typeof visit.value !== "string")
        continue;
      const uri = visit.value;
      if (
        !resources.some(
          (entry) =>
            entry.resource.uri === uri ||
            entry.resource.originalUris?.includes(uri),
        )
      )
        resources.push({
          resource: {
            identity: `unresolved-uri:${byteDigest(new TextEncoder().encode(uri))}`,
            uri,
            originalUris: [uri],
          },
          status: "missing",
        });
    }
  }
  for (const entry of resources)
    for (const dependency of entry.resource.dependencies ?? [])
      if (
        !resources.some(
          (candidate) => candidate.resource.identity === dependency,
        )
      )
        throw new Error(
          "Resource dependency inventory is incomplete; list missing/external dependencies explicitly.",
        );
  const manifest: ExchangeManifest = {
    format: "publisle:exchange",
    formatVersion: 1,
    source: {
      path: sourcePath,
      digest: byteDigest(sourceBytes),
      format: input.archival ? "archival-markdown" : "json",
    },
    contracts: {
      path: "contracts.json",
      digest: byteDigest(files.get("contracts.json") ?? new Uint8Array()),
    },
    lock: {
      path: "lock.json",
      digest: byteDigest(files.get("lock.json") ?? new Uint8Array()),
    },
    resources,
    executableRequirements: bundle.contracts
      .filter((entry) => entry.contract.portability.implementationBound)
      .map((entry) => ({
        type: entry.contract.identity.type,
        hooks: Object.keys(entry.contract.portability.executable).sort(),
      })),
  };
  files.set("exchange.json", encode(manifest));
  validateManifest(parseJson(canonicalizeJson(manifest)));
  enforceBudgets(files, limits);
  const root = resolve(directory);
  await mkdir(root); // EEXIST rejects even an empty directory: no implicit replacement.
  if ([...files.keys()].some((path) => path.startsWith("assets/")))
    await mkdir(join(root, "assets"));
  for (const [path, bytes] of files) {
    const file = await open(
      join(root, path),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
    } finally {
      await file.close();
    }
  }
  return manifest;
}
function enforceBudgets(
  files: ReadonlyMap<string, Uint8Array>,
  limits: ExchangeLimits,
): void {
  const maxFiles = checkedLimit(limits.maxFiles, 256);
  const maxFile = checkedLimit(limits.maxFileBytes, 64 * 1024 * 1024);
  const maxTotal = checkedLimit(limits.maxTotalBytes, 128 * 1024 * 1024);
  if (files.size > maxFiles)
    throw new Error("Exchange file count exceeds budget.");
  let total = 0;
  for (const [path, bytes] of files) {
    validateExchangePath(path);
    total += bytes.byteLength;
    if (bytes.byteLength > maxFile || total > maxTotal)
      throw new Error("Exchange byte budget exceeded.");
  }
}

/** Strict offline reading. Paths/symlinks are validated before opening; no executable imports. */
export async function importExchange(
  directory: string,
  options: {
    readonly limits?: ExchangeLimits;
    readonly decodeArchival?: (source: string) => Document;
    /** Optional host/out-of-band pin for the package inventory itself. */
    readonly expectedManifestDigest?: string;
  } = {},
): Promise<{
  readonly source: Document;
  readonly bundle: ContractBundle;
  readonly manifest: ExchangeManifest;
  readonly resources: ReadonlyMap<string, Uint8Array>;
}> {
  const root = resolve(directory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("Exchange root must be a real directory.");
  const canonicalRoot = await realpath(root);
  const files = new Map<string, Uint8Array>();
  const read = async (path: string, expected?: string) => {
    validateExchangePath(path);
    const cached = files.get(path);
    if (cached) {
      if (expected !== undefined && byteDigest(cached) !== expected)
        throw new Error("Exchange file digest mismatch.");
      return cached;
    }
    let current = root;
    for (const part of path.split("/")) {
      current = join(current, part);
      const stat = await lstat(current);
      if (stat.isSymbolicLink())
        throw new Error("Exchange symlink escape denied.");
    }
    const actual = await realpath(current);
    const outside = relative(canonicalRoot, actual);
    if (
      outside === ".." ||
      outside.startsWith(`..${sep}`) ||
      outside.startsWith(sep)
    )
      throw new Error("Exchange path escapes root.");
    const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Uint8Array;
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > checkedLimit(options.limits?.maxFileBytes, 64 * 1024 * 1024)
      )
        throw new Error(
          "Exchange entry must be a bounded regular non-hardlinked file.",
        );
      const max = Math.min(
        checkedLimit(options.limits?.maxFileBytes, 64 * 1024 * 1024),
        checkedLimit(options.limits?.maxTotalBytes, 128 * 1024 * 1024) -
          [...files.values()].reduce((sum, value) => sum + value.byteLength, 0),
      );
      if (max < 0) throw new Error("Exchange byte budget exceeded.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = new Uint8Array(Math.min(65536, max + 1));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        size += bytesRead;
        if (size > max) throw new Error("Exchange byte budget exceeded.");
        chunks.push(chunk.slice(0, bytesRead));
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } finally {
      await file.close();
    }
    files.set(path, bytes);
    enforceBudgets(files, options.limits ?? {});
    if (expected !== undefined && byteDigest(bytes) !== expected)
      throw new Error("Exchange file digest mismatch.");
    return bytes;
  };
  const manifestValue = parseJson(
    await read("exchange.json", options.expectedManifestDigest),
  );
  validateManifest(manifestValue);
  const manifest = manifestValue as unknown as ExchangeManifest;
  const bundle = await validateContractBundle(
    parseJson(await read(manifest.contracts.path, manifest.contracts.digest)),
  );
  const lock = parseJson(await read(manifest.lock.path, manifest.lock.digest));
  if (canonicalizeJson(lock) !== canonicalizeJson(bundle.lock))
    throw new Error("Exchange lock mismatch.");
  const sourceBytes = await read(manifest.source.path, manifest.source.digest);
  const sourceValue =
    manifest.source.format === "json"
      ? parseJson(sourceBytes)
      : options.decodeArchival
        ? options.decodeArchival(
            new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes),
          )
        : (() => {
            throw new Error("Archival decoder is required by host.");
          })();
  const source = await validateLockedDocument(sourceValue, bundle);
  for (const block of source.blocks) {
    const contract = bundle.contracts.find(
      (entry) =>
        entry.contract.identity.type === block.type &&
        entry.contract.identity.schemaVersion === block.schemaVersion,
    );
    if (!contract?.contract.traversal) continue;
    for (const visit of traverseDeclared(
      block.data,
      contract.contract.traversal,
    )) {
      const uri = visit.value;
      if (
        visit.kind === "resource" &&
        typeof uri === "string" &&
        !manifest.resources.some(
          (entry) =>
            entry.resource.uri === uri ||
            entry.resource.originalUris?.includes(uri),
        )
      )
        throw new Error("Declared resource is absent from exchange inventory.");
    }
  }
  const expectedExecutable = bundle.contracts
    .filter((entry) => entry.contract.portability.implementationBound)
    .map((entry) => ({
      type: entry.contract.identity.type,
      hooks: Object.keys(entry.contract.portability.executable).sort(),
    }));
  if (
    canonicalizeJson(expectedExecutable) !==
    canonicalizeJson(manifest.executableRequirements)
  )
    throw new Error("Executable requirements mismatch.");
  const resources = new Map<string, Uint8Array>();
  for (const entry of manifest.resources)
    if (entry.status === "included") {
      if (!entry.path || !entry.byteDigest)
        throw new Error("Included resource requires path and byte digest.");
      const bytes = await read(entry.path, entry.byteDigest);
      if (
        entry.resource.byteDigest !== undefined &&
        entry.resource.byteDigest !== byteDigest(bytes)
      )
        throw new Error("Resource pin mismatch.");
      resources.set(entry.resource.identity, bytes);
    }
  return { source, bundle, manifest, resources };
}
function validateManifest(value: JsonValue): void {
  if (
    !isPlainObject(value) ||
    value["format"] !== "publisle:exchange" ||
    value["formatVersion"] !== 1 ||
    !Array.isArray(value["resources"]) ||
    value["resources"].length > 256 ||
    !Array.isArray(value["executableRequirements"])
  )
    throw new Error("Invalid exchange manifest.");
  for (const key of ["source", "contracts", "lock"]) {
    const entry = value[key];
    if (
      !isPlainObject(entry) ||
      typeof entry["path"] !== "string" ||
      typeof entry["digest"] !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(entry["digest"])
    )
      throw new Error("Invalid exchange file pin.");
    validateExchangePath(entry["path"]);
    if (key !== "source" && entry["path"] !== `${key}.json`)
      throw new Error("Exchange metadata must use its reserved path.");
    if (
      key === "source" &&
      entry["format"] !== "json" &&
      entry["format"] !== "archival-markdown"
    )
      throw new Error("Invalid source format.");
    if (
      key === "source" &&
      entry["path"] !==
        (entry["format"] === "json" ? "source.json" : "source.md")
    )
      throw new Error("Source must use its reserved path.");
  }
  const identities = new Set<string>();
  for (const entry of value["resources"]) {
    if (
      !isPlainObject(entry) ||
      !isPlainObject(entry["resource"]) ||
      typeof entry["resource"]["identity"] !== "string" ||
      typeof entry["resource"]["uri"] !== "string" ||
      !["included", "missing", "external"].includes(String(entry["status"]))
    )
      throw new Error("Invalid resource manifest entry.");
    const identity = entry["resource"]["identity"];
    if (identities.has(identity))
      throw new Error("Duplicate resource identity.");
    identities.add(identity);
    const resource = entry["resource"];
    for (const key of ["originalUris", "dependencies"])
      if (
        resource[key] !== undefined &&
        (!Array.isArray(resource[key]) ||
          !resource[key].every((item) => typeof item === "string"))
      )
        throw new Error("Invalid resource string list.");
    for (const key of ["resolvedLocation", "mediaType", "version"])
      if (resource[key] !== undefined && typeof resource[key] !== "string")
        throw new Error("Invalid resource metadata.");
    if (
      resource["external"] !== undefined &&
      typeof resource["external"] !== "boolean"
    )
      throw new Error("Invalid external resource flag.");
    if (
      resource["byteDigest"] !== undefined &&
      (typeof resource["byteDigest"] !== "string" ||
        !/^sha256:[0-9a-f]{64}$/u.test(resource["byteDigest"]))
    )
      throw new Error("Invalid resource content pin.");
    if (entry["path"] !== undefined) {
      if (typeof entry["path"] !== "string")
        throw new Error("Resource path must be a string.");
      validateExchangePath(entry["path"]);
      if (
        entry["status"] === "included" &&
        !/^assets\/[0-9a-f]{64}\.bin$/u.test(entry["path"])
      )
        throw new Error("Resource must use a content-addressed asset path.");
    }
    if (
      entry["status"] === "included" &&
      (typeof entry["byteDigest"] !== "string" ||
        !/^sha256:[0-9a-f]{64}$/u.test(entry["byteDigest"]))
    )
      throw new Error("Invalid resource byte digest.");
    if (
      entry["status"] === "included" &&
      entry["path"] !== `assets/${String(entry["byteDigest"]).slice(7)}.bin`
    )
      throw new Error("Asset path and digest disagree.");
    if (
      entry["status"] !== "included" &&
      (entry["path"] !== undefined || entry["byteDigest"] !== undefined)
    )
      throw new Error(
        "External/missing resources must not disguise included files.",
      );
  }
  const entries: readonly JsonValue[] = value["resources"];
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) throw new Error("Resource dependency cycle.");
    if (done.has(id)) return;
    active.add(id);
    const entry = entries.find(
      (item) =>
        isPlainObject(item) &&
        isPlainObject(item["resource"]) &&
        item["resource"]["identity"] === id,
    );
    if (!isPlainObject(entry) || !isPlainObject(entry["resource"]))
      throw new Error("Resource dependency inventory is incomplete.");
    const dependencies: unknown = entry["resource"]["dependencies"];
    if (Array.isArray(dependencies))
      for (const dependency of dependencies) {
        if (typeof dependency !== "string")
          throw new Error("Invalid dependency identity.");
        visit(dependency);
      }
    active.delete(id);
    done.add(id);
  };
  for (const id of identities) visit(id);
}
