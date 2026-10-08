import type { Block, BlockType, Diagnostic, Document } from "@publisle/schema";
import type { PrepareOptions } from "./types.ts";

function freeze(value: unknown): void {
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
}

export function inspectProfiles(
  document: Document<Block<BlockType, unknown>>,
  options: PrepareOptions,
  traversal: import("@publisle/schema").ProfileContext["traversal"] = [],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [code, level] of Object.entries(options.diagnosticPolicy ?? {})) {
    if (level !== "info" && level !== "warning" && level !== "error") {
      diagnostics.push({
        level: "error",
        code: "invalid-diagnostic-policy",
        message: `Invalid profile severity for ${code}.`,
      });
    }
  }
  if (diagnostics.length) return diagnostics;
  for (const profile of options.profiles ?? []) {
    try {
      // Each inspector gets an independent copy; it cannot alter source/output or another inspector's input.
      const snapshot = structuredClone(document);
      freeze(snapshot);
      const context = structuredClone({ traversal });
      freeze(context);
      for (const diagnostic of profile.inspect(snapshot, context)) {
        const override =
          options.diagnosticPolicy &&
          Object.hasOwn(options.diagnosticPolicy, diagnostic.code)
            ? options.diagnosticPolicy[diagnostic.code]
            : undefined;
        diagnostics.push({
          ...diagnostic,
          level: override ?? diagnostic.level,
          profile: profile.name,
        });
      }
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "profile-inspection-failed",
        message: `Profile ${profile.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        profile: profile.name,
      });
    }
  }
  return diagnostics;
}
