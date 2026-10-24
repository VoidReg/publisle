import { compilePublication as compile } from "./publication-core.ts";
import { installMathRenderer } from "./render-plan-core.ts";
export { publicationReaderManifest } from "./publication-core.ts";
let loading: Promise<void> | undefined;
function containsMath(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsMath);
  const object = value as Record<string, unknown>;
  return (
    object["type"] === "math" ||
    object["type"] === "publisle:math" ||
    Object.values(object).some(containsMath)
  );
}
/** Compile with math support loaded only when the document contains math. */
export async function compilePublicationAsync(
  ...args: Parameters<typeof compile>
): Promise<ReturnType<typeof compile>> {
  if (containsMath(args[0])) {
    loading ??= import("katex")
      .then(({ default: renderer }) => installMathRenderer(renderer))
      .catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
    await loading;
  }
  return compile(...args);
}
