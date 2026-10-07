import type { PublisleViteOptions } from "@publisle/adapter-core";
import type { BlockRegistry } from "@publisle/core";
import { reactTarget } from "./emitter.ts";

export interface ReactAdapterOptions extends Omit<
  PublisleViteOptions,
  "target" | "registry"
> {
  readonly registry: BlockRegistry;
}
export const publisleReact = (options: ReactAdapterOptions) =>
  import("@publisle/adapter-core/vite").then(({ createPublisleVitePlugin }) =>
    createPublisleVitePlugin({ ...options, target: reactTarget }),
  );
export const defineReactRenderer = <
  T extends { module: string; exportName?: string },
>(
  renderer: T,
): T => renderer;
export { reactTarget } from "./emitter.ts";
export { PublisleContent, type PublisleContentProps } from "./content.ts";
export { PublisleArticle, type PublisleArticleProps } from "./article.ts";
export { PublisleIsland } from "./runtime.ts";
