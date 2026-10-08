import {
  canonicalizeJson,
  parseJson,
  parseDocument,
  parseContractDependencies,
  type ContractDependency,
  type Document,
} from "@publisle/schema";
import {
  createContractBundle,
  exportDocumentContracts,
  validateBlockContract,
  validateContractBundle,
  type ContractBundle,
  type ExportableRegistry,
  type ExportedContract,
} from "./export.ts";
import { validateStructure } from "./validate.ts";
import { validateSemanticBindings } from "./semantics.ts";

export interface ContractFetchPolicy {
  readonly origins: readonly string[];
  readonly schemes?: readonly ("https:" | "http:")[];
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly maxContracts?: number;
  readonly maxDepth?: number;
  readonly timeoutMs?: number;
}
export interface ContractResolutionOptions {
  readonly bundle?: ContractBundle;
  readonly cache?: Map<string, unknown>;
  /** Remote retrieval is disabled unless a policy and locations are supplied. */
  readonly remote?: {
    readonly policy: ContractFetchPolicy;
    readonly locations: Readonly<Record<string, readonly string[]>>;
    readonly fetch?: typeof fetch;
  };
  readonly offline?: boolean;
}
export class ContractResolutionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const fail = (code: string, message: string): never => {
  throw new ContractResolutionError(code, message);
};
async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(
        new ContractResolutionError(
          "contract-fetch-timeout",
          "Contract retrieval timed out.",
        ),
      );
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
function limit(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum)
    return fail("invalid-fetch-policy", "Invalid resolution budget.");
  return result;
}
async function fetchContract(
  location: string,
  remote: NonNullable<ContractResolutionOptions["remote"]>,
): Promise<ExportedContract> {
  const { policy } = remote;
  const bytes = limit(policy.maxBytes, 2 * 1024 * 1024, 2 * 1024 * 1024);
  const timeout = limit(policy.timeoutMs, 5000, 60000);
  const redirects = policy.maxRedirects ?? 0;
  if (!Number.isSafeInteger(redirects) || redirects < 0 || redirects > 5)
    return fail(
      "invalid-fetch-policy",
      "Redirect budget must be between zero and five.",
    );
  const origins = new Set(
    policy.origins.map((origin) => {
      const url = new URL(origin);
      if (url.origin !== origin || url.username || url.password)
        return fail(
          "invalid-fetch-policy",
          "Origins must be exact origin strings.",
        );
      return origin;
    }),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);
  try {
    let url = new URL(location);
    for (let hop = 0; ; hop++) {
      if (
        !(policy.schemes ?? ["https:"]).includes(
          url.protocol as "https:" | "http:",
        ) ||
        !origins.has(url.origin) ||
        url.username ||
        url.password ||
        url.hash
      )
        return fail(
          "contract-location-denied",
          `Location denied by host policy: ${url.origin}`,
        );
      const response = await abortable(
        (remote.fetch ?? globalThis.fetch)(url.href, {
          redirect: "manual",
          signal: controller.signal,
          credentials: "omit",
          headers: { accept: "application/json" },
        }),
        controller.signal,
      );
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => undefined);
        if (hop >= redirects)
          return fail("contract-redirect-denied", "Redirect budget exceeded.");
        const next = response.headers.get("location");
        if (!next)
          return fail("contract-redirect-denied", "Redirect has no location.");
        url = new URL(next, url);
        continue;
      }
      if (!response.ok || !response.body)
        return fail(
          "contract-fetch-failed",
          `Contract response status ${String(response.status)}.`,
        );
      const length = response.headers.get("content-length");
      if (
        length !== null &&
        (!/^\d+$/u.test(length) || Number(length) > bytes)
      ) {
        void response.body.cancel().catch(() => undefined);
        return fail(
          "contract-response-too-large",
          "Response length exceeds policy.",
        );
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await abortable(
            reader.read(),
            controller.signal,
          );
          if (done) break;
          size += value.byteLength;
          if (size > bytes)
            return fail(
              "contract-response-too-large",
              "Stream exceeds byte budget.",
            );
          chunks.push(value);
        }
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const joined = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return await validateBlockContract(parseJson(joined));
    }
  } catch (error) {
    if (controller.signal.aborted)
      return fail("contract-fetch-timeout", "Contract retrieval timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Offline bundle → verified cache → explicitly approved static JSON. Never follows schema refs onto the network. */
export async function resolveContracts(
  dependencies: readonly ContractDependency[],
  options: ContractResolutionOptions = {},
): Promise<ContractBundle> {
  const pins = parseContractDependencies(dependencies);
  const supplied = options.bundle
    ? await validateContractBundle(options.bundle)
    : undefined;
  const available = new Map(
    supplied?.contracts.map((entry) => [entry.id, entry]),
  );
  const used = new Map<string, ExportedContract>();
  const heights = new Map<string, number>();
  const active = new Set<string>();
  const maximum = limit(options.remote?.policy.maxContracts, 128, 128);
  const depth = limit(options.remote?.policy.maxDepth, 32, 64);
  if (options.offline || !options.remote) {
    const pending = pins.map((pin) => ({ id: pin.id, level: 0 }));
    const inspected = new Set<string>();
    const missing = new Set<string>();
    for (const request of pending) {
      if (inspected.has(request.id)) continue;
      if (request.level > depth || inspected.size >= maximum)
        return fail(
          "contract-graph-limit",
          "Contract graph exceeds depth/count policy.",
        );
      inspected.add(request.id);
      let entry = available.get(request.id);
      if (!entry && options.cache?.has(request.id))
        entry = await validateBlockContract(options.cache.get(request.id));
      if (!entry) {
        missing.add(request.id);
        continue;
      }
      if (entry.id !== request.id)
        return fail(
          "contract-pin-mismatch",
          "Cache content does not match requested immutable identity.",
        );
      available.set(entry.id, entry);
      for (const dependency of entry.contract.dependencies)
        pending.push({ id: dependency, level: request.level + 1 });
    }
    if (missing.size)
      return fail(
        "missing-offline-contract",
        `Missing immutable contracts: ${[...missing].sort().join(", ")}`,
      );
  }
  const visit = async (
    id: string,
    level: number,
  ): Promise<ExportedContract> => {
    if (!/^urn:publisle:contract:sha256:[0-9a-f]{64}$/u.test(id))
      return fail(
        "invalid-contract-pin",
        "Mutable aliases are not dependency identities.",
      );
    if (active.has(id))
      return fail("contract-dependency-cycle", "Contract dependency cycle.");
    const existing = used.get(id);
    if (existing) {
      if (level + (heights.get(id) ?? 0) > depth)
        return fail(
          "contract-graph-limit",
          "Contract graph exceeds depth/count policy.",
        );
      return existing;
    }
    if (level > depth || used.size + active.size >= maximum)
      return fail(
        "contract-graph-limit",
        "Contract graph exceeds depth/count policy.",
      );
    active.add(id);
    let entry = available.get(id);
    if (!entry && options.cache?.has(id))
      entry = await validateBlockContract(options.cache.get(id));
    if (!entry && !options.offline && options.remote) {
      const locations = options.remote.locations[id] ?? [];
      if (locations.length > 8)
        return fail(
          "contract-location-limit",
          "At most eight approved mirrors per contract.",
        );
      let last: unknown;
      for (const location of locations) {
        try {
          entry = await fetchContract(location, options.remote);
          break;
        } catch (error) {
          last = error;
        }
      }
      if (!entry && last instanceof Error) throw last;
    }
    if (!entry)
      return fail(
        "missing-offline-contract",
        `Missing immutable contract: ${id}`,
      );
    if (entry.id !== id)
      return fail(
        "contract-pin-mismatch",
        "Cache or remote content does not match requested immutable identity.",
      );
    let height = 0;
    for (const dependency of entry.contract.dependencies) {
      await visit(dependency, level + 1);
      height = Math.max(height, 1 + (heights.get(dependency) ?? 0));
    }
    active.delete(id);
    used.set(id, entry);
    heights.set(id, height);
    return entry;
  };
  const roots: string[] = [];
  for (const pin of pins) {
    const entry = await visit(pin.id, 0);
    if (
      entry.digest !== pin.digest ||
      entry.contract.identity.type !== pin.type ||
      entry.contract.identity.schemaVersion !== pin.schemaVersion
    )
      return fail(
        "contract-pin-mismatch",
        `Identity mismatch for ${pin.type}.`,
      );
    roots.push(entry.id);
  }
  const result = await createContractBundle([...used.values()], roots);
  // Cache commits only after the complete closure has passed all checks.
  for (const entry of result.contracts)
    options.cache?.set(entry.id, parseJson(canonicalizeJson(entry)));
  return result;
}

/** Explicit save-time conversion: retain original source, attach exact exported pins, never render-time rewrite. */
export async function lockDocument(
  source: Document,
  registry: ExportableRegistry,
): Promise<{
  readonly original: Document;
  readonly document: Document;
  readonly bundle: ContractBundle;
}> {
  const original = parseDocument(parseJson(canonicalizeJson(source)));
  if (canonicalizeJson(source) !== canonicalizeJson(original))
    return fail(
      "unmodeled-source-fields",
      "Source contains unsupported envelope fields. Preserve original source; move portable additions into extensions before pinning.",
    );
  const bundle = await exportDocumentContracts(original, registry);
  const dependencies = bundle.contracts
    .filter((entry) => bundle.roots.includes(entry.id))
    .map((entry) => ({
      type: entry.contract.identity.type,
      schemaVersion: entry.contract.identity.schemaVersion,
      id: entry.id,
      digest: entry.digest,
    }))
    .sort((a, b) =>
      a.type < b.type
        ? -1
        : a.type > b.type
          ? 1
          : a.schemaVersion - b.schemaVersion,
    );
  if (
    original.dependencies !== undefined &&
    canonicalizeJson(
      [...original.dependencies].sort((a, b) =>
        a.type < b.type
          ? -1
          : a.type > b.type
            ? 1
            : a.schemaVersion - b.schemaVersion,
      ),
    ) !== canonicalizeJson(dependencies)
  )
    return fail(
      "contract-repin-required",
      "Existing immutable pins differ; retain original source and explicitly approve a new publication rather than silently repinning.",
    );
  const document = {
    ...parseDocument(parseJson(canonicalizeJson(original))),
    dependencies,
  };
  await validateLockedDocument(document, bundle);
  return { original, document, bundle };
}

export async function validateLockedDocument(
  source: unknown,
  supplied: ContractBundle,
): Promise<Document> {
  const document = parseDocument(parseJson(canonicalizeJson(source)));
  if (canonicalizeJson(source) !== canonicalizeJson(document))
    return fail(
      "unmodeled-source-fields",
      "Locked source contains unsupported envelope fields; preserve it rather than silently dropping data.",
    );
  if (document.schemaVersion !== 1 || document.dependencies === undefined)
    return fail(
      "missing-contract-manifest",
      "A portable locked document requires its current frozen envelope and exact dependency manifest. Convert explicitly at save time.",
    );
  const bundle = await resolveContracts(document.dependencies, {
    bundle: supplied,
    offline: true,
  });
  const used = new Set(
    document.blocks.map(
      (block) => `${block.type}@${String(block.schemaVersion)}`,
    ),
  );
  if (
    document.dependencies.length !== used.size ||
    document.dependencies.some(
      (pin) => !used.has(`${pin.type}@${String(pin.schemaVersion)}`),
    )
  )
    return fail(
      "contract-manifest-mismatch",
      "Manifest must match exactly the used block type/version set.",
    );
  const ids = new Set<string>();
  for (const block of document.blocks) {
    if (ids.has(block.id))
      return fail(
        "duplicate-block-id",
        "Duplicate block identity in locked source.",
      );
    ids.add(block.id);
    const contract = bundle.contracts.find(
      (entry) =>
        entry.contract.identity.type === block.type &&
        entry.contract.identity.schemaVersion === block.schemaVersion,
    );
    if (!contract)
      return fail(
        "missing-offline-contract",
        `No exact contract for ${block.type}.`,
      );
    const body = contract.contract;
    const result = body.semantics
      ? validateSemanticBindings(
          body.semantics,
          block.data,
          body.source.dataSchema,
          body.source.schemaDependencies,
        )
      : validateStructure(
          block.data,
          body.source.dataSchema,
          body.source.schemaDependencies,
        );
    if (!result.valid)
      return fail(
        "invalid-locked-block",
        `Block ${block.id}: ${canonicalizeJson(result.diagnostics)}`,
      );
  }
  return document;
}
