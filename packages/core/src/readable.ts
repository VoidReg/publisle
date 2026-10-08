import {
  canonicalizeJson,
  SchemaParseError,
  parseReadable,
  resolveReadable,
  type Block,
  type InteractiveContent,
} from "@publisle/schema";
import { sha256Hex } from "./hash.ts";

/** Digest preimage is exactly {id,type,schemaVersion,data}; readable is an associated sidecar. */
export function getBlockSourceDigest(
  block: Block<`${string}:${string}`, unknown>,
): `sha256:${string}` {
  const { id, type, schemaVersion, data } = block;
  return `sha256:${sha256Hex(canonicalizeJson({ id, type, schemaVersion, data }))}`;
}
export function inspectReadable(
  block: Block<`${string}:${string}`, unknown>,
): InteractiveContent | undefined {
  if (!block.readable) return undefined;
  const readable = parseReadable(block.readable);
  if (readable.sourceDigest !== getBlockSourceDigest(block))
    throw new SchemaParseError(
      "stale-readable-representation",
      "Readable representation source digest is stale.",
    );
  return resolveReadable(readable, block.data);
}
