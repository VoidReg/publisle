import katex from "katex";
import { installMathRenderer } from "./render-plan-core.ts";
import { compilePublication as compile } from "./publication-core.ts";
export * from "./publication-core.ts";
/** Synchronous compiler with bundled math support. */
export function compilePublication(
  ...args: Parameters<typeof compile>
): ReturnType<typeof compile> {
  installMathRenderer(katex);
  return compile(...args);
}
