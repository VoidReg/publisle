import {
  isJsonValue,
  isPlainObject,
  type PlannedArtifact,
  type PlannedResource,
  type ResourcePlan,
  type JsonValue,
} from "@publisle/schema";
import { sha256Hex } from "./hash.ts";
import { stable } from "./identity.ts";
import type { ResourceResolver } from "./types.ts";

export class ResourcePlanningError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new ResourcePlanningError(
      "invalid-resource",
      `${label} must be a nonempty string.`,
    );
  return value;
}

/** Lexical path normalization only: preserve URL schemes, absolute roots, and leading .. . */
function canonicalUri(value: unknown): string {
  const uri = nonempty(value, "Resource URI");
  if (/^[a-z][a-z\d+.-]*:/iu.test(uri) || uri.startsWith("//")) return uri;
  const suffixStart = uri.search(/[?#]/u);
  const path = suffixStart < 0 ? uri : uri.slice(0, suffixStart);
  const suffix = suffixStart < 0 ? "" : uri.slice(suffixStart);
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push(part);
    } else parts.push(part);
  }
  return nonempty(
    `${absolute ? "/" : ""}${parts.join("/")}${suffix}`,
    "Normalized resource URI",
  );
}

export function createResourcePlanner(resolver?: ResourceResolver) {
  const requests = new Map<string, PlannedResource>();
  const sources = new Map<string, PlannedResource>();
  const canonicalSources = new Map<string, string>();
  const artifacts = new Map<string, PlannedArtifact>();
  const failures = new Map<string, ResourcePlanningError>();
  const visiting = new Set<string>();

  function sourceFor(value: unknown): PlannedResource {
    const originalUri = nonempty(value, "Original resource URI");
    const requestedUri = canonicalUri(value);
    const cached = requests.get(requestedUri);
    if (cached) {
      const canonical = sources.get(cached.identity) ?? cached;
      const updated = {
        ...canonical,
        originalUris: [
          ...new Set([...(canonical.originalUris ?? []), originalUri]),
        ].sort(),
      };
      sources.set(updated.identity, updated);
      requests.set(requestedUri, updated);
      return updated;
    }
    const failure = failures.get(requestedUri);
    if (failure) throw failure;
    if (visiting.has(requestedUri))
      throw new ResourcePlanningError(
        "resource-dependency-cycle",
        `Resource dependency cycle at ${requestedUri}.`,
      );
    visiting.add(requestedUri);
    try {
      let uri = requestedUri;
      let version: string | undefined;
      let dependencies: string[] = [];
      let provenance: Pick<
        PlannedResource,
        "resolvedLocation" | "mediaType" | "byteDigest" | "external" | "dataset"
      > = {};
      if (resolver) {
        nonempty(resolver.version, "Resource resolver version");
        let result: unknown;
        try {
          result = resolver.resolve({ uri: requestedUri });
        } catch (error) {
          throw new ResourcePlanningError(
            "resource-resolution-failed",
            `Resolving ${requestedUri} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (result === undefined)
          throw new ResourcePlanningError(
            "missing-resource",
            `Resource ${requestedUri} was not found.`,
          );
        if (!isPlainObject(result))
          throw new ResourcePlanningError(
            "invalid-resource",
            `Resolver result for ${requestedUri} must be an object.`,
          );
        // Reject promises and incomplete results through required synchronous version validation.
        version = nonempty(
          result["version"],
          `Resource ${requestedUri} version`,
        );
        if (result["uri"] !== undefined) uri = canonicalUri(result["uri"]);
        const fields: Record<string, JsonValue> = {};
        for (const key of ["resolvedLocation", "mediaType"] as const)
          if (result[key] !== undefined)
            fields[key] = nonempty(result[key], key);
        if (result["byteDigest"] !== undefined) {
          if (
            typeof result["byteDigest"] !== "string" ||
            !/^sha256:[0-9a-f]{64}$/u.test(result["byteDigest"])
          )
            throw new ResourcePlanningError(
              "invalid-resource",
              "Byte digest must be a SHA-256 digest of exact resource bytes.",
            );
          fields["byteDigest"] = result["byteDigest"];
        }
        if (result["external"] !== undefined) {
          if (typeof result["external"] !== "boolean")
            throw new ResourcePlanningError(
              "invalid-resource",
              "External status must be boolean.",
            );
          fields["external"] = result["external"];
        }
        if (result["dataset"] !== undefined) {
          if (!isJsonValue(result["dataset"]))
            throw new ResourcePlanningError(
              "invalid-resource",
              "Dataset descriptor must be JSON; keep bulk bytes external.",
            );
          fields["dataset"] = structuredClone(result["dataset"]);
        }
        provenance = fields as Pick<
          PlannedResource,
          | "resolvedLocation"
          | "mediaType"
          | "byteDigest"
          | "external"
          | "dataset"
        >;
        const references = result["dependencies"];
        if (references !== undefined) {
          if (!Array.isArray(references))
            throw new ResourcePlanningError(
              "invalid-resource",
              `Resource ${requestedUri} dependencies must be an array.`,
            );
          dependencies = references.map((reference: unknown) => {
            if (
              !isPlainObject(reference) ||
              Object.keys(reference).some((key) => key !== "uri")
            )
              throw new ResourcePlanningError(
                "invalid-resource",
                `Resource ${requestedUri} dependencies must contain source-only URI objects.`,
              );
            return sourceFor(reference["uri"]).identity;
          });
        }
      }
      dependencies = [...new Set(dependencies)].sort();
      const identity = sha256Hex(
        stable({
          uri,
          version: version ?? null,
          dependencies,
          provenance,
          resolverBase: resolver?.base ?? null,
        }),
      );
      const existing = canonicalSources.get(uri);
      if (existing !== undefined && existing !== identity)
        throw new ResourcePlanningError(
          "resource-resolution-conflict",
          `Conflicting revisions or dependencies for canonical resource ${uri}.`,
        );
      const resource: PlannedResource = {
        ...provenance,
        originalUris: [
          ...new Set([
            ...(sources.get(identity)?.originalUris ?? []),
            originalUri,
          ]),
        ].sort(),
        uri,
        identity,
        dependencies,
        ...(version === undefined ? {} : { version }),
      };
      canonicalSources.set(uri, identity);
      sources.set(identity, resource);
      requests.set(requestedUri, resource);
      return resource;
    } catch (error) {
      const failure =
        error instanceof ResourcePlanningError
          ? error
          : new ResourcePlanningError(
              "invalid-resource",
              `Invalid resource ${requestedUri}: ${error instanceof Error ? error.message : String(error)}`,
            );
      failures.set(requestedUri, failure);
      throw failure;
    } finally {
      visiting.delete(requestedUri);
    }
  }

  return {
    add(reference: unknown): void {
      if (!isPlainObject(reference))
        throw new ResourcePlanningError(
          "invalid-resource",
          "A resource reference must be an object.",
        );
      const transform =
        reference["transform"] === undefined
          ? undefined
          : nonempty(reference["transform"], "Resource transform");
      let options: JsonValue | undefined;
      try {
        if (reference["options"] !== undefined) {
          if (transform === undefined || !isJsonValue(reference["options"]))
            throw new Error(
              "Options require a transform and JSON-compatible values.",
            );
          options = reference["options"];
        }
      } catch {
        throw new ResourcePlanningError(
          "invalid-resource",
          "Resource options require a transform and finite, acyclic JSON-compatible values.",
        );
      }
      const resource = sourceFor(reference["uri"]);
      if (transform !== undefined) {
        const artifact = {
          sourceIdentity: resource.identity,
          transform,
          ...(options === undefined
            ? {}
            : { options: structuredClone(options) }),
        };
        const identity = sha256Hex(stable(artifact));
        artifacts.set(identity, { ...artifact, identity });
      }
    },
    plan(): ResourcePlan {
      return {
        resources: [...sources.values()].sort((a, b) =>
          a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0,
        ),
        artifacts: [...artifacts.values()].sort((a, b) =>
          a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0,
        ),
      };
    },
  };
}
