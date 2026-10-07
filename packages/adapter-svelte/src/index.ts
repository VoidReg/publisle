import type { PublisleViteOptions } from "@publisle/adapter-core";
import type { BlockRegistry } from "@publisle/core";
import { svelteTarget } from "./emitter.ts";

export interface SvelteAdapterOptions extends Omit<
  PublisleViteOptions,
  "target" | "registry"
> {
  readonly registry: BlockRegistry;
}
export const publisleSvelte = (options: SvelteAdapterOptions) =>
  import("@publisle/adapter-core/vite").then(({ createPublisleVitePlugin }) =>
    createPublisleVitePlugin({ ...options, target: svelteTarget }),
  );
export const defineSvelteRenderer = <
  T extends { module: string; exportName?: string },
>(
  renderer: T,
): T => renderer;
export { svelteTarget } from "./emitter.ts";
