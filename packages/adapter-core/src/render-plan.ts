import katex from "katex";
import {
  createRenderPlan as create,
  installMathRenderer,
} from "./render-plan-core.ts";
export { citationKey } from "./render-plan-core.ts";
/** Synchronous compiler with bundled math support. */
export function createRenderPlan(
  ...args: Parameters<typeof create>
): ReturnType<typeof create> {
  installMathRenderer(katex);
  return create(...args);
}
