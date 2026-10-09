import { template as ieee } from "@publisle/template-ieee";
import { template as acm } from "@publisle/template-acm";
import {
  template as elsevier,
  authorDateTemplate,
} from "@publisle/template-elsevier";
import { template as springer } from "@publisle/template-springer";
import { writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Diagnostic } from "@publisle/schema";
import { document, parseDocument, parseJson } from "@publisle/schema";
import { fromMarkdown } from "@publisle/markdown";
import type { TemplateRegistry } from "@publisle/template-sdk";
import type { MarkdownBlockCodec } from "@publisle/markdown";
import {
  createLatexPackage,
  parseBibtex,
  resolveDocument,
  toBibtex,
  toCslJson,
  toJats,
  createJatsPackage,
  toLatex,
} from "@publisle/research";
import {
  compileLatexPackage,
  collectJatsPackage,
  lookupDoi,
  fetchBibliography,
  importCslJson,
  writeLatexPackage,
  doctorCompilers,
  setupCompiler,
  writePackageArchive,
} from "@publisle/research/node";

/** Trusted host configuration shape this plugin reads from a Core CLI config. */
export interface ResearchCliConfig {
  readonly templates?: TemplateRegistry;
  readonly markdown?: { readonly codecs?: readonly MarkdownBlockCodec[] };
}

export interface ResearchCommandIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Helpers supplied by the Core CLI so the plugin never imports it statically. */
export interface ResearchCommandContext {
  loadConfig(file: string | undefined): Promise<unknown>;
  diagnosticText(item: Diagnostic, file: string): string;
}

export const researchCommandNames = [
  "export",
  "bibliography",
  "doctor",
  "setup",
] as const;

export type ResearchCommandName = (typeof researchCommandNames)[number];

export const researchCommandHelp = `Research export: publisle export <file.json|file.md> --to bibtex|csl-json|latex|jats|pdf [--style numeric|author-date|file.csl] [--output <new-file>]
Journal templates: publisle export <file.json|file.md> --to pdf|submission --template ieee-journal [--engine pdflatex|lualatex] --output <new-file|new-directory>
BibTeX import: publisle bibliography <file.bib>
Compiler: publisle doctor | publisle setup compiler
Submission: --config host.ts --template-data data.json --compiler auto|native|container [--archive]
pdf and submission require --output. --output refuses existing files.
These commands require the optional @publisle/cli-research plugin.
`;

function isResearchConfig(value: unknown): ResearchCliConfig {
  return typeof value === "object" && value !== null ? value : {};
}

/** Research-profile commands, loaded dynamically by the Core CLI when installed. */
export async function runResearchCommand(
  command: ResearchCommandName,
  args: readonly string[],
  io: ResearchCommandIo,
  context: ResearchCommandContext,
): Promise<number> {
  if (command === "setup") {
    if (args.length !== 2 || args[1] !== "compiler")
      throw new Error("Use publisle setup compiler");
    io.stdout(`Installed compiler ${await setupCompiler()}\n`);
    return 0;
  }
  if (command === "doctor") {
    const status = await doctorCompilers(
      createLatexPackage(
        document({
          metadata: { title: "Doctor", authors: [{ name: "Publisle" }] },
          blocks: [],
        }),
      ),
    );
    io.stdout(JSON.stringify(status, null, 2) + "\n");
    return status.native.available || status.container.available ? 0 : 1;
  }
  if (command === "bibliography") {
    const source = args[1];
    if (!source)
      throw new Error(
        "bibliography requires a file, --doi DOI or --url HTTPS URL.",
      );
    if (!source.startsWith("-")) {
      const { readFile } = await import("node:fs/promises");
      if (args.length !== 2)
        throw new Error("Local bibliography import accepts one file.");
      const text = await readFile(resolve(source), "utf8");
      io.stdout(
        JSON.stringify(
          text.trimStart().startsWith("@")
            ? parseBibtex(text)
            : importCslJson(text),
          null,
          2,
        ) + "\n",
      );
      return 0;
    }
    if (source !== "--doi" && source !== "--url")
      throw new Error("Use --doi or --url.");
    const value = args[2];
    if (!value) throw new Error("Missing bibliography location.");
    let cacheDirectory = resolve(".publisle-cache/bibliography");
    let refresh = false;
    for (let index = 3; index < args.length; index++) {
      if (args[index] === "--refresh") refresh = true;
      else if (args[index] === "--cache" && args[index + 1])
        cacheDirectory = resolve(args[++index] ?? "");
      else
        throw new Error("Remote bibliography accepts --cache and --refresh.");
    }
    const result = await (source === "--doi"
      ? lookupDoi(value, { cacheDirectory, refresh })
      : fetchBibliography(value, { cacheDirectory, refresh }));
    io.stdout(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }
  return exportCommand(args, io, context);
}

async function exportCommand(
  args: readonly string[],
  io: ResearchCommandIo,
  context: ResearchCommandContext,
): Promise<number> {
  const { readFile, lstat } = await import("node:fs/promises");
  const file = args[1];
  if (!file || file.startsWith("-"))
    throw new Error("export requires a JSON or Markdown document.");
  let target:
    | "bibtex"
    | "csl-json"
    | "latex"
    | "jats"
    | "pdf"
    | "submission"
    | "jats-submission"
    | undefined;
  let style = "numeric";
  let template: string | undefined;
  let engine: "pdflatex" | "lualatex" | undefined;
  let configFile: string | undefined;
  let templateDataFile: string | undefined;
  let compiler: "auto" | "native" | "container" = "auto";
  let archive = false;
  let outputFile: string | undefined;
  const seen = new Set<string>();
  for (let index = 2; index < args.length; index += 1) {
    const key = args[index];
    if (key === undefined || seen.has(key))
      throw new Error("Invalid or duplicate export option.");
    seen.add(key);
    if (key === "--archive") {
      archive = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-"))
      throw new Error(`Missing value for ${key}.`);
    index += 1;
    if (
      key === "--to" &&
      (value === "bibtex" ||
        value === "csl-json" ||
        value === "latex" ||
        value === "jats" ||
        value === "pdf" ||
        value === "submission" ||
        value === "jats-submission")
    )
      target = value;
    else if (key === "--template") template = value;
    else if (key === "--config") configFile = value;
    else if (key === "--template-data") templateDataFile = value;
    else if (
      key === "--compiler" &&
      (value === "auto" || value === "native" || value === "container")
    )
      compiler = value;
    else if (
      key === "--engine" &&
      (value === "pdflatex" || value === "lualatex")
    )
      engine = value;
    else if (key === "--style") style = value;
    else if (key === "--output") outputFile = value;
    else
      throw new Error(
        "export accepts --to, --style, --template, --engine, and --output.",
      );
  }
  if (target === undefined)
    throw new Error(
      "--to must be bibtex, csl-json, latex, jats, pdf, or submission.",
    );
  if (
    template &&
    target !== "pdf" &&
    target !== "submission" &&
    target !== "latex"
  )
    throw new Error("Templates apply to PDF, LaTeX and submission exports.");
  if (archive && target !== "submission" && target !== "jats-submission")
    throw new Error("--archive requires submission export.");
  if (
    (target === "pdf" ||
      target === "submission" ||
      target === "jats-submission") &&
    outputFile === undefined
  )
    throw new Error("pdf and submission export require --output.");
  const sourceName = resolve(file);
  const source = await readFile(sourceName, "utf8");
  const extension = extname(sourceName).toLowerCase();
  const config = isResearchConfig(await context.loadConfig(configFile));
  const loaded =
    extension === ".md" || extension === ".markdown"
      ? fromMarkdown(source, { sourceName, ...config.markdown })
      : { document: parseDocument(parseJson(source)), diagnostics: [] };
  for (const item of loaded.diagnostics)
    io.stderr(context.diagnosticText(item, sourceName));
  if (loaded.document === undefined) return 1;
  if (target === "jats-submission") {
    const result = await collectJatsPackage(
      createJatsPackage(
        resolveDocument(
          loaded.document,
          style === "numeric" || style === "author-date"
            ? style
            : await readFile(resolve(style), "utf8"),
        ),
      ),
      dirname(sourceName),
    );
    if (archive) await writePackageArchive(result, resolve(outputFile ?? ""));
    else await writeLatexPackage(result, resolve(outputFile ?? ""));
    return 0;
  }
  if (
    target === "pdf" ||
    target === "submission" ||
    (target === "latex" && template)
  ) {
    const destination = resolve(outputFile ?? "");
    try {
      if (!outputFile) {
        const error = new Error("No output file");
        Object.assign(error, { code: "ENOENT" });
        throw error;
      }
      await lstat(destination);
      throw new Error("Export output already exists.");
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    const sourcePackage = createLatexPackage(loaded.document, {
      ...(template ? { template } : {}),
      ...(engine ? { engine } : {}),
      style:
        style === "numeric" || style === "author-date"
          ? style
          : await readFile(resolve(style), "utf8"),
      templates: {
        [ieee.id]: ieee,
        [acm.id]: acm,
        [elsevier.id]: elsevier,
        [authorDateTemplate.id]: authorDateTemplate,
        [springer.id]: springer,
        ...config.templates,
      },
      ...(templateDataFile
        ? {
            data: parseJson(
              await readFile(resolve(templateDataFile)),
            ) as Record<string, unknown>,
          }
        : {}),
    });
    if (target === "latex") {
      const text = sourcePackage.files["manuscript.tex"] ?? "";
      if (outputFile) await writeFile(destination, text, { flag: "wx" });
      else io.stdout(text);
      return 0;
    }
    const compiled = await compileLatexPackage(sourcePackage, {
      sourceDirectory: dirname(sourceName),
      compiler,
    });
    for (const diagnostic of compiled.diagnostics)
      io.stderr(
        `${sourceName}: warning [${diagnostic.code}]: ${diagnostic.message}\n`,
      );
    if (target === "submission") {
      if (archive) await writePackageArchive(compiled, destination);
      else await writeLatexPackage(compiled, destination);
    } else await writeFile(destination, compiled.pdf, { flag: "wx" });
    return 0;
  }
  const styleSource =
    style === "numeric" || style === "author-date"
      ? style
      : await readFile(resolve(style), "utf8");
  const resolved = resolveDocument(loaded.document, styleSource);
  for (const loss of resolved.losses)
    io.stderr(`${sourceName}: warning [${loss.code}]: ${loss.message}\n`);
  const text =
    target === "bibtex"
      ? toBibtex(resolved.article.entries)
      : target === "csl-json"
        ? toCslJson(resolved.article.entries)
        : target === "latex"
          ? toLatex(resolved)
          : toJats(resolved);
  if (outputFile) await writeFile(resolve(outputFile), text, { flag: "wx" });
  else io.stdout(text.endsWith("\n") ? text : `${text}\n`);
  return 0;
}
