import type { PublisleViteOptions } from "@publisle/adapter-core";
import { vueTarget } from "./emitter.ts";
export { vueTarget } from "./emitter.ts";
export { PublisleArticle, PublisleIsland } from "./runtime.ts";
export { createRenderPlan, compilePublication } from "@publisle/adapter-core";
export function publisleVue(options: Omit<PublisleViteOptions, "target">) {
  return import("@publisle/adapter-core/vite").then(
    ({ createPublisleVitePlugin }) =>
      createPublisleVitePlugin({ ...options, target: vueTarget }),
  );
}
