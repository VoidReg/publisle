// Loads docs/guides and docs/standards through Publisle's own pipeline:
// Markdown → portable document → prepared publication artifact. Repo-relative
// links (../../packages/..., sibling guides) are resolved at load time: links
// that leave docs/ become GitHub blob/raw URLs; sibling docs become site routes.
// The rendered pages are compiled by the same compiler the product ships, so
// the documentation site is itself a Publisle demo.
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import { preparePublication } from "@publisle/adapter-astro";
import type { LocalPublicationOptions } from "@publisle/adapter-core/node";
import { fromMarkdown } from "@publisle/markdown";
import type { Document } from "@publisle/schema";

const REPO_BLOB = "https://github.com/VoidReg/publisle/blob/main";
const REPO_RAW = "https://raw.githubusercontent.com/VoidReg/publisle/main";
const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
]);

export interface DocEntryInput {
  /** Stable collection id, e.g. "guides/meaning". */
  readonly id: string;
  /** Absolute file path of the Markdown source. */
  readonly file: string;
  readonly section: "guides" | "standards";
  readonly title: string;
}

export interface PublisleDocsLoaderOptions extends LocalPublicationOptions {
  /** File paths present in the collection; in-docs links to them become routes. */
  readonly knownFiles: readonly string[];
  /** Site route prefix for in-docs links. */
  readonly routePrefix?: string;
}

interface LinkContext {
  readonly file: string;
  readonly docsDir: string;
  readonly knownFiles: ReadonlySet<string>;
  readonly routePrefix: string;
}

function resolveTarget(rawTarget: string, context: LinkContext): string | null {
  const [pathPart, anchor = ""] = rawTarget.split("#");
  if (!pathPart) return null;
  const base = dirname(context.file);
  const absolute = resolve(base, pathPart);
  const repoPath = relative(context.docsDir, absolute).replaceAll("\\", "/");
  if (repoPath.startsWith("..")) return null; // outside the repo checkout
  return anchor ? `${repoPath}#${anchor}` : repoPath;
}

function rewriteLink(rawTarget: string, context: LinkContext): string {
  if (
    /^[a-z][a-z0-9+.-]*:/iu.test(rawTarget) ||
    rawTarget.startsWith("/") ||
    rawTarget.startsWith("#")
  ) {
    return rawTarget;
  }
  const repoPath = resolveTarget(rawTarget, context);
  if (repoPath === null) return rawTarget;
  const [pathPart, anchor = ""] = repoPath.split("#");
  const suffix = anchor ? `#${anchor}` : "";

  if (pathPart.endsWith(".md")) {
    if (context.knownFiles.has(pathPart)) {
      const route = pathPart
        .replace(/(^|\/)README\.md$/u, "")
        .replace(/\.md$/u, "");
      return `${context.routePrefix}/${route}${suffix}`;
    }
    return `${REPO_BLOB}/docs/${pathPart}${suffix}`;
  }
  if (ASSET_EXTENSIONS.has(extname(pathPart))) {
    return `${REPO_RAW}/docs/${pathPart}`;
  }
  return `${REPO_BLOB}/docs/${pathPart}`;
}

function rewriteLinks(markdown: string, context: LinkContext): string {
  return markdown.replace(
    /\]\(([^()\s]+)\)/gu,
    (_whole, target: string) => `](${rewriteLink(target, context)})`,
  );
}

export function publisleDocsLoader(
  entries: readonly DocEntryInput[],
  options: PublisleDocsLoaderOptions,
): Loader {
  // Entries live at docs/<section>/<name>.md; two dirnames reach docs/.
  const docsDir =
    entries.length > 0 ? dirname(dirname(entries[0].file)) : process.cwd();
  const routePrefix = options.routePrefix ?? "/docs";
  const { knownFiles, ...publicationOptions } = options;

  return {
    name: "publisle-docs",
    async load(context) {
      const { store, watcher } = context;
      const linkContext = (file: string): LinkContext => ({
        file,
        docsDir,
        knownFiles: new Set(knownFiles),
        routePrefix,
      });

      async function update(entry: DocEntryInput): Promise<void> {
        const source = await readFile(entry.file, "utf8");
        const rewritten = rewriteLinks(source, linkContext(entry.file));
        const imported = fromMarkdown(rewritten, { sourceName: entry.file });
        if (!imported.document) {
          throw new Error(
            `Publisle docs loader: ${entry.file}\n` +
              imported.diagnostics
                .map((item) => `${item.code}: ${item.message}`)
                .join("\n"),
          );
        }
        const document: Document = imported.document;
        const publication = preparePublication(document, publicationOptions);
        const artifact = {
          ...publication,
          diagnostics: [...imported.diagnostics, ...publication.diagnostics],
        };
        const data = await context.parseData({
          id: entry.id,
          data: {
            publication: artifact,
            title: entry.title,
            section: entry.section,
          },
        });
        store.set({
          id: entry.id,
          data,
          digest: context.generateDigest(data),
          filePath: relative(
            fileURLToPath(context.config.root),
            resolve(entry.file),
          ),
        });
      }

      store.clear();
      for (const entry of entries) await update(entry);
      watcher?.on("change", (changed) => {
        for (const entry of entries)
          if (changed === entry.file) void update(entry);
      });
    },
  };
}
