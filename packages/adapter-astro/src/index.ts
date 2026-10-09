import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import type { Loader } from "astro/loaders";
import {
  loadPublication,
  type LocalPublicationOptions,
} from "@publisle/adapter-core/node";
export {
  loadPublication,
  preparePublication,
} from "@publisle/adapter-core/node";
/** Local content loader; hosts provide stable collection ids and own routing. */
export function publisleLoader(
  files: Readonly<Record<string, string>>,
  options: LocalPublicationOptions,
): Loader {
  return {
    name: "publisle-local",
    async load(context) {
      const { store, watcher } = context;
      async function update(id: string, file: string) {
        const publication = await loadPublication(file, options);
        const data = await context.parseData({ id, data: { publication } });
        store.set({
          id,
          data,
          digest: context.generateDigest(data),
          filePath: relative(fileURLToPath(context.config.root), resolve(file)),
        });
      }
      store.clear();
      for (const [id, file] of Object.entries(files)) await update(id, file);
      watcher?.on("change", (changed) => {
        for (const [id, file] of Object.entries(files))
          if (changed === file) void update(id, file);
      });
    },
  };
}
export function publisleAstro(): AstroIntegration {
  return {
    name: "@publisle/adapter-astro",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            ssr: {
              noExternal: ["@publisle/adapter-core", "@publisle/adapter-astro"],
            },
          },
        });
      },
    },
  };
}
