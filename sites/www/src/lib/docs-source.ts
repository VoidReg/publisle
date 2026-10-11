// Single source of truth for the documentation set loaded into the site:
// the Publisle content collection, the raw-markdown endpoints, and the
// GitHub links all enumerate from here.
import { existsSync } from "node:fs";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, resolve } from "node:path";

export type DocSection = "guides" | "standards";

export interface DocSource {
  /** Stable collection id, e.g. "guides/meaning" or "standards" (README). */
  readonly id: string;
  readonly section: DocSection;
  readonly title: string;
  /** First-paragraph summary for meta descriptions (~155 chars). */
  readonly description: string;
  /** Absolute path of the Markdown source in the checkout. */
  readonly file: string;
  /** Path under docs/ in the repository, e.g. "guides/meaning.md". */
  readonly repoPath: string;
}

/** repo/docs, resolved from the package working directory at build/dev time,
 * with the module-relative path as a fallback for direct Node usage. */
function resolveDocsRoot(): string {
  const candidates = [
    resolve(process.cwd(), "../../docs"),
    fileURLToPath(new URL("../../../../docs/", import.meta.url)),
  ];
  for (const candidate of candidates)
    if (existsSync(candidate)) return candidate;
  throw new Error(
    `Publisle docs directory not found (${candidates.join(", ")}).`,
  );
}

export const docsRoot: string = resolveDocsRoot();

/** Repository path of a doc's Markdown source (README lives at the bare id). */
export function docRepoPath(id: string): string {
  return id === "standards" ? "standards/README.md" : `${id}.md`;
}

/** On-site raw route serving the exact Markdown source. */
export function docRawRoute(id: string): string {
  return `/docs/${docRepoPath(id)}`;
}

/** First prose paragraph of a document, flattened to ~155 plain characters. */
export function describeMarkdown(source: string): string {
  const lines = source.split("\n");
  const paragraph: string[] = [];
  for (const line of lines.slice(
    lines.findIndex((line) => line.startsWith("# ")) + 1,
  )) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^(#|>|\||[-*]\s|```|\s{4})/.test(trimmed)) continue;
    paragraph.push(trimmed);
  }
  const plain = paragraph
    .join(" ")
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replaceAll(/`([^`]*)`/gu, "$1")
    .replaceAll(/[*_]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (plain.length <= 155) return plain;
  const cut = plain.slice(0, 155);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 80 ? boundary : 155).trimEnd()}…`;
}

function sectionSources(section: DocSection): DocSource[] {
  const dir = join(docsRoot, section);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const file = join(dir, name);
      const source = readFileSync(file, "utf8");
      const heading = /^#\s+(.+?)\s*$/mu.exec(source)?.[1];
      const base = basename(name, ".md");
      const isReadme = name === "README.md";
      return {
        id: isReadme ? section : `${section}/${base}`,
        section,
        title: heading ?? (isReadme ? section : base),
        description: describeMarkdown(source),
        file,
        repoPath: `${section}/${name}`,
      };
    });
}

let cached: DocSource[] | undefined;

export function docSources(): DocSource[] {
  cached ??= [...sectionSources("guides"), ...sectionSources("standards")];
  return cached;
}
