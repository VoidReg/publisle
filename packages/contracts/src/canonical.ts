import { canonicalizeJson } from "@publisle/schema";
export { canonicalizeJson } from "@publisle/schema";

/** Exact UTF-8 JCS preimage; no fields are implicitly excluded. */
export async function digestJson(value: unknown): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(canonicalizeJson(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
