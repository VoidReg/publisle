import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { parseDocument, parseJson, type Document } from "@publisle/schema";
import { fromMarkdown, type MarkdownBlockCodec } from "@publisle/markdown";
import { prepare, type PrepareOptions } from "@publisle/core";
import {
  compilePublication,
  type PublicationArtifact,
  type PublicationCompilerOptions,
} from "./publication.ts";
export interface LocalPublicationOptions
  extends PrepareOptions, PublicationCompilerOptions {
  readonly markdownCodecs?: readonly MarkdownBlockCodec[];
}
export function preparePublication(
  document: Document,
  options: LocalPublicationOptions,
): PublicationArtifact {
  const result = prepare(document, options);
  if (
    !result.document ||
    result.diagnostics.some((item) => item.level === "error")
  )
    throw new Error(
      result.diagnostics
        .map((item) => `${item.code}: ${item.message}`)
        .join("\n"),
    );
  return compilePublication(result.document, options);
}
/** Build/server-only local loading. No Vite module imports or host routing assumptions. */
export async function loadPublication(
  file: string,
  options: LocalPublicationOptions,
): Promise<PublicationArtifact> {
  const sourceName = resolve(file);
  const source = await readFile(sourceName, "utf8");
  if (/\.m(?:d|arkdown)$/iu.test(extname(sourceName))) {
    const result = fromMarkdown(source, {
      sourceName,
      ...(options.markdownCodecs ? { codecs: options.markdownCodecs } : {}),
    });
    if (!result.document)
      throw new Error(
        result.diagnostics
          .map((item) => `${item.code}: ${item.message}`)
          .join("\n"),
      );
    const publication = preparePublication(result.document, options);
    return {
      ...publication,
      diagnostics: [...result.diagnostics, ...publication.diagnostics],
    };
  }
  return preparePublication(parseDocument(parseJson(source)), options);
}
