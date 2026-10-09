/** Host-owned corpus cache. Readers must not import this module. */
import {
  isPlainObject,
  type Block,
  type BlockType,
  type Diagnostic,
  type Document,
  type PreparedDocument,
} from "@publisle/schema";
import { sha256Hex } from "./hash.ts";
import { stable } from "./identity.ts";
import { prepare } from "./prepare.ts";
import type { BlockRegistry, PrepareOptions } from "./types.ts";

export class CompilationCacheError extends Error {
  readonly code: "tampered-cache" | "invalid-cache";
  constructor(code: "tampered-cache" | "invalid-cache", message: string) {
    super(message);
    this.code = code;
  }
}

export interface CompilationCache {
  has(key: string): boolean;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export function createCompilationCache(): CompilationCache {
  const entries = new Map<string, unknown>();
  return {
    has: (key) => entries.has(key),
    get: (key) => entries.get(key),
    set: (key, value) => entries.set(key, value),
  };
}

export interface CorpusDocument {
  readonly key: string;
  readonly document: Document<Block<BlockType, unknown>>;
  readonly contracts?: readonly string[];
  readonly resources?: readonly string[];
}

export interface SharedCacheEntry {
  readonly id: string;
  readonly payload: unknown;
}

export interface CompileCorpusOptions {
  readonly registry: BlockRegistry;
  readonly cache: CompilationCache;
  readonly documents: readonly CorpusDocument[];
  readonly contracts?: readonly SharedCacheEntry[];
  readonly resources?: readonly SharedCacheEntry[];
  /** Bounds scheduled document tasks, including async host compilers. Integer from 1 to 32. */
  readonly concurrency?: number;
  /** Included in each document input identity so a compiler change invalidates outputs. */
  readonly compilerIdentity?: string;
  readonly prepareOptions?: Omit<PrepareOptions, "registry">;
  readonly compile?: (document: PreparedDocument, key: string) => unknown;
  /** Called only for cache misses that reach preparation. */
  readonly onPrepare?: (key: string) => void;
}

export interface CorpusDocumentResult {
  readonly key: string;
  readonly status: "reused" | "rebuilt" | "invalid";
  readonly outputIdentity?: string;
  readonly prepared?: PreparedDocument;
  readonly publication?: unknown;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CompileCorpusResult {
  readonly documents: readonly CorpusDocumentResult[];
  readonly shared: {
    readonly contracts: readonly string[];
    readonly resources: readonly string[];
    readonly modules: readonly string[];
  };
}

interface StoredBody {
  readonly payload: unknown;
  readonly dependencies: readonly string[];
}

interface DocumentPayload {
  readonly inputIdentity: string;
  readonly outputIdentity: string;
  readonly prepared: PreparedDocument;
  readonly publication: unknown;
  readonly modules: readonly string[];
}

export async function compileCorpus(
  options: CompileCorpusOptions,
): Promise<CompileCorpusResult> {
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw new CompilationCacheError(
      "invalid-cache",
      "Concurrency must be an integer from 1 to 32.",
    );
  const keys = options.documents.map((document) => document.key);
  if (
    keys.some((key) => key.trim() === "") ||
    new Set(keys).size !== keys.length
  )
    throw new CompilationCacheError(
      "invalid-cache",
      "Document keys must be unique and nonempty.",
    );
  const contracts = new Set<string>();
  const resources = new Set<string>();
  const modules = new Set<string>();
  for (const entry of options.contracts ?? []) {
    writeShared(options.cache, `contract:${entry.id}`, entry.payload);
    contracts.add(entry.id);
  }
  for (const entry of options.resources ?? []) {
    writeShared(options.cache, `resource:${entry.id}`, entry.payload);
    resources.add(entry.id);
  }
  const documents = await mapPool(
    options.documents,
    concurrency,
    async (item) => {
      const contractIds = [...(item.contracts ?? [])].sort();
      const resourceIds = [...(item.resources ?? [])].sort();
      const missing = [
        ...contractIds.filter((id) => !options.cache.has(`contract:${id}`)),
        ...resourceIds.filter((id) => !options.cache.has(`resource:${id}`)),
      ];
      if (missing.length)
        return invalid(
          item.key,
          `Missing shared cache entries: ${missing.sort().join(", ")}`,
        );
      const dependencies = [
        ...contractIds.map((id) => `contract:${id}`),
        ...resourceIds.map((id) => `resource:${id}`),
      ];
      for (const dependency of dependencies)
        readRecord(options.cache, dependency);
      for (const id of contractIds) contracts.add(id);
      for (const id of resourceIds) resources.add(id);
      const inputIdentity = fingerprint(item, options);
      const cacheKey = `document:${item.key}`;
      if (options.cache.has(cacheKey)) {
        const stored = readRecord(options.cache, cacheKey);
        const payload = documentPayload(stored.payload, cacheKey);
        if (payload.inputIdentity === inputIdentity) {
          for (const dependency of stored.dependencies)
            readRecord(options.cache, dependency);
          for (const id of payload.modules) modules.add(id);
          return {
            key: item.key,
            status: "reused" as const,
            outputIdentity: payload.outputIdentity,
            prepared: structuredClone(payload.prepared),
            ...(payload.publication === null
              ? {}
              : { publication: structuredClone(payload.publication) }),
            diagnostics: [],
          };
        }
      }
      options.onPrepare?.(item.key);
      const preparedResult = prepare(structuredClone(item.document), {
        ...options.prepareOptions,
        registry: options.registry,
      });
      if (!preparedResult.document)
        return {
          key: item.key,
          status: "invalid" as const,
          diagnostics: preparedResult.diagnostics,
        };
      const publication = options.compile
        ? await options.compile(preparedResult.document, item.key)
        : null;
      const moduleIds = publicationModules(publication);
      for (const id of moduleIds) {
        writeShared(
          options.cache,
          `module:${id}`,
          modulePayload(publication, id),
        );
        modules.add(id);
      }
      const payload: DocumentPayload = {
        inputIdentity,
        outputIdentity: preparedResult.document.cacheIdentity,
        prepared: preparedResult.document,
        publication,
        modules: moduleIds,
      };
      replaceRecord(options.cache, cacheKey, payload, dependencies);
      return {
        key: item.key,
        status: "rebuilt" as const,
        outputIdentity: payload.outputIdentity,
        prepared: structuredClone(payload.prepared),
        ...(publication === null
          ? {}
          : { publication: structuredClone(publication) }),
        diagnostics: preparedResult.diagnostics,
      };
    },
  );
  return {
    documents,
    shared: {
      contracts: [...contracts].sort(),
      resources: [...resources].sort(),
      modules: [...modules].sort(),
    },
  };
}

function invalid(key: string, message: string): CorpusDocumentResult {
  return {
    key,
    status: "invalid",
    diagnostics: [
      { level: "error", code: "missing-shared-dependency", message },
    ],
  };
}

function fingerprint(
  item: CorpusDocument,
  options: CompileCorpusOptions,
): string {
  const preparation = options.prepareOptions;
  return sha256Hex(
    stable({
      schemaVersion: item.document.schemaVersion,
      metadata: item.document.metadata ?? null,
      extensions: item.document.extensions ?? null,
      dependencies: item.document.dependencies ?? null,
      blocks: item.document.blocks.map((block) =>
        sha256Hex(
          stable({
            id: block.id,
            type: block.type,
            schemaVersion: block.schemaVersion,
            data: block.data,
            readable: block.readable ?? null,
          }),
        ),
      ),
      contracts: [...(item.contracts ?? [])].sort(),
      resources: [...(item.resources ?? [])].sort(),
      registry: options.registry.version,
      compiler: options.compilerIdentity ?? null,
      preparation: {
        unknownBlocks: preparation?.unknownBlocks ?? null,
        preparationVersion: preparation?.preparationVersion ?? null,
        profiles:
          preparation?.profiles?.map((profile) => ({
            name: profile.name,
            version: profile.version ?? null,
          })) ?? [],
        diagnosticPolicy: preparation?.diagnosticPolicy ?? null,
        resolverVersion: preparation?.resourceResolver?.version ?? null,
        resolverBase: preparation?.resourceResolver?.base ?? null,
        contractPins: preparation?.contractPins ?? null,
        sourceMap: preparation?.sourceMap ?? null,
        documentMigrations:
          preparation?.documentMigrations?.map((migration) => migration.from) ??
          [],
      },
    }),
  );
}

function writeShared(
  cache: CompilationCache,
  key: string,
  payload: unknown,
): void {
  const body = { payload, dependencies: [] as string[] };
  if (!cache.has(key)) {
    cache.set(key, { digest: sha256Hex(stable(body)), ...body });
    return;
  }
  const current = readRecord(cache, key);
  if (stable(current.payload) !== stable(payload))
    throw new CompilationCacheError(
      "tampered-cache",
      `Cache entry ${key} does not match the supplied content.`,
    );
}

function replaceRecord(
  cache: CompilationCache,
  key: string,
  payload: unknown,
  dependencies: readonly string[],
): void {
  if (cache.has(key)) readRecord(cache, key);
  const body = { payload, dependencies: [...dependencies].sort() };
  cache.set(key, { digest: sha256Hex(stable(body)), ...body });
}

function readRecord(cache: CompilationCache, key: string): StoredBody {
  if (!cache.has(key))
    throw new CompilationCacheError(
      "tampered-cache",
      `Missing cache entry ${key}.`,
    );
  const raw = cache.get(key);
  if (
    !isPlainObject(raw) ||
    typeof raw["digest"] !== "string" ||
    !Array.isArray(raw["dependencies"]) ||
    raw["dependencies"].some((entry) => typeof entry !== "string")
  )
    throw new CompilationCacheError(
      "tampered-cache",
      `Cache entry ${key} is malformed.`,
    );
  const body = {
    payload: raw["payload"],
    dependencies: raw["dependencies"] as string[],
  };
  if (sha256Hex(stable(body)) !== raw["digest"])
    throw new CompilationCacheError(
      "tampered-cache",
      `Cache entry ${key} failed its content digest.`,
    );
  return body;
}

function documentPayload(value: unknown, key: string): DocumentPayload {
  if (
    !isPlainObject(value) ||
    typeof value["inputIdentity"] !== "string" ||
    typeof value["outputIdentity"] !== "string" ||
    !isPlainObject(value["prepared"]) ||
    value["prepared"]["cacheIdentity"] !== value["outputIdentity"] ||
    !Array.isArray(value["modules"]) ||
    value["modules"].some((entry) => typeof entry !== "string") ||
    !("publication" in value)
  )
    throw new CompilationCacheError(
      "tampered-cache",
      `Cache entry ${key} is not a prepared document record.`,
    );
  return value as unknown as DocumentPayload;
}

function publicationModules(publication: unknown): string[] {
  if (!isPlainObject(publication) || !Array.isArray(publication["modules"]))
    return [];
  const ids = publication["modules"].map((entry) => {
    if (
      !isPlainObject(entry) ||
      typeof entry["id"] !== "string" ||
      !entry["id"]
    )
      throw new CompilationCacheError(
        "invalid-cache",
        "Publication modules require a nonempty string id.",
      );
    return entry["id"];
  });
  return [...new Set(ids)].sort();
}

function modulePayload(publication: unknown, id: string): unknown {
  if (!isPlainObject(publication) || !Array.isArray(publication["modules"]))
    return { id };
  return (
    publication["modules"].find(
      (entry) => isPlainObject(entry) && entry["id"] === id,
    ) ?? { id }
  );
}

async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item !== undefined) results[index] = await run(item);
      }
    }),
  );
  return results;
}
