import { SchemaParseError } from "./error.ts";
import { canonicalizeJson } from "./canonical.ts";
import { isPlainObject } from "./object.ts";
import {
  parseInteractiveContent,
  type InteractiveContent,
} from "./prepared.ts";
import {
  EXPLANATION_TRAVERSAL,
  RICH_TRAVERSAL_RULES,
  resolvePointer,
  traverseDeclared,
} from "./traversal.ts";

export type ReadableProvenance =
  | { readonly kind: "authored" }
  | {
      readonly kind: "generated";
      readonly generator: string;
      readonly version: string;
      readonly source: string;
    };
/** Authored prose is stored once, either here or at the fixed binding in block.data. */
export type ReadableRepresentation = {
  readonly sourceDigest: string;
  readonly provenance: ReadableProvenance;
} & (
  | { readonly binding: string; readonly content?: never }
  | { readonly content: InteractiveContent; readonly binding?: never }
);
export function parseReadable(value: unknown): ReadableRepresentation {
  canonicalizeJson(value);
  if (
    !isPlainObject(value) ||
    typeof value["sourceDigest"] !== "string" ||
    !/^sha256:[0-9a-f]{64}$(?![\s\S])/u.test(value["sourceDigest"]) ||
    Object.keys(value).some(
      (key) =>
        !["sourceDigest", "provenance", "binding", "content"].includes(key),
    )
  )
    throw new SchemaParseError(
      "invalid-readable-representation",
      "Readable representation requires a SHA-256 source digest.",
    );
  const provenance = value["provenance"];
  if (
    !isPlainObject(provenance) ||
    (provenance["kind"] !== "authored" && provenance["kind"] !== "generated") ||
    Object.keys(provenance).some(
      (key) => !["kind", "generator", "version", "source"].includes(key),
    ) ||
    (provenance["kind"] === "authored" &&
      Object.keys(provenance).length !== 1) ||
    (provenance["kind"] === "generated" &&
      ["generator", "version", "source"].some(
        (key) => typeof provenance[key] !== "string" || !provenance[key].trim(),
      ))
  )
    throw new SchemaParseError(
      "invalid-readable-provenance",
      "Generated prose must identify its generator, version and source; authored prose has no generator.",
    );
  const base = {
    sourceDigest: value["sourceDigest"],
    provenance: provenance as ReadableProvenance,
  };
  if (typeof value["binding"] === "string" && value["content"] === undefined) {
    resolvePointer({}, value["binding"]);
    return { ...base, binding: value["binding"] };
  }
  if (value["binding"] === undefined && value["content"] !== undefined) {
    const content = parseInteractiveContent(value["content"]);
    traverseDeclared(content, {
      root: EXPLANATION_TRAVERSAL,
      rules: RICH_TRAVERSAL_RULES,
    });
    return { ...base, content };
  }
  throw new SchemaParseError(
    "invalid-readable-representation",
    "Choose content or binding, not duplicate editable prose.",
  );
}
export function resolveReadable(
  readable: ReadableRepresentation,
  data: unknown,
): InteractiveContent {
  const location = readable.content
    ? { found: true, value: readable.content }
    : resolvePointer(data, readable.binding);
  if (!location.found)
    throw new SchemaParseError(
      "unresolved-readable-binding",
      "Readable binding does not exist.",
    );
  const content = parseInteractiveContent(location.value);
  const visits = traverseDeclared(content, {
    root: EXPLANATION_TRAVERSAL,
    rules: RICH_TRAVERSAL_RULES,
  });
  if (visits.some((visit) => visit.kind === "unresolved"))
    throw new SchemaParseError(
      "unsupported-readable-content",
      "Readable prose contains an unsupported rich-content branch; the source is preserved, not reinterpreted.",
    );
  return content;
}
