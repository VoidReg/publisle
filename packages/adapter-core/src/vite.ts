import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { prepare } from "@publisle/core";
import { fromMarkdown } from "@publisle/markdown";
import { compilePublication } from "./publication.ts";
import { createRenderPlan } from "./render-plan.ts";
import type {
  AdapterTarget,
  PublisleViteOptions,
  RenderPlan,
} from "./types.ts";

const js = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

export const publicationTarget: AdapterTarget = {
  name: "publication",
  extension: "js",
  emitModule(plan: RenderPlan): string {
    const publication = compilePublication(plan, {
      styles: "minimal",
    });
    return `export const publication = ${js(publication)};\nexport const metadata = ${js(publication.metadata ?? null)};\nexport const diagnostics = ${js(publication.diagnostics)};\n`;
  },
};

export function publislePublication(
  options: Omit<PublisleViteOptions, "target">,
): Plugin {
  return createPublisleVitePlugin({ ...options, target: publicationTarget });
}

const PREFIX = "\0publisle:";

export function createPublisleVitePlugin(options: PublisleViteOptions): Plugin {
  const sources = new Map<string, string>();
  return {
    name: `publisle-${options.target.name}`,
    enforce: "pre",
    resolveId(id, importer) {
      if (!id.endsWith(".md")) return undefined;
      const filename = path.resolve(
        importer ? path.dirname(importer.replace(/^\0/u, "")) : process.cwd(),
        id,
      );
      const virtualId = `${PREFIX}${options.target.name}:${encodeURIComponent(filename)}.${options.target.extension}`;
      sources.set(virtualId, filename);
      return virtualId;
    },
    async load(id) {
      const filename = sources.get(id);
      if (!filename) return undefined;
      this.addWatchFile(filename);
      const source = await readFile(filename, "utf8");
      const imported = fromMarkdown(source, { sourceName: filename });
      const sourceDocument = imported.document;
      if (!sourceDocument) {
        return this.error(
          imported.diagnostics.map(({ message }) => message).join("\n"),
        );
      }
      const prepared = prepare(sourceDocument, options);
      const preparedDocument = prepared.document;
      if (!preparedDocument) {
        return this.error(
          prepared.diagnostics.map(({ message }) => message).join("\n"),
        );
      }
      const renderers = { ...(options.renderers ?? {}) };
      for (const island of preparedDocument.islands)
        renderers[island.blockType] ??= { module: island.blockType };
      const plan = createRenderPlan(preparedDocument, {
        ...options,
        renderers,
      });
      return options.target.emitModule(
        {
          ...plan,
          diagnostics: [
            ...imported.diagnostics,
            ...prepared.diagnostics,
            ...plan.diagnostics,
          ],
        },
        { source, filename },
      );
    },
  };
}
