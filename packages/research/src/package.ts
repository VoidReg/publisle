import type { Document } from "@publisle/schema";
import type {
  PublishingTemplate,
  TemplateRegistry,
  SourcePackage,
  TemplateContext,
  LatexEngine,
} from "@publisle/template-sdk";
import {
  template as articleTemplate,
  arabicTemplate,
} from "@publisle/template-article";
import { citationClusters } from "./article.ts";
import { resolveDocument } from "./resolve.ts";
export type { LatexEngine } from "@publisle/template-sdk";
export type LatexPackage = SourcePackage;
export interface LatexPackageOptions {
  readonly template?: string | PublishingTemplate;
  readonly templates?: TemplateRegistry;
  readonly engine?: LatexEngine;
  readonly style?: string;
  readonly fonts?: Readonly<Record<string, string>>;
  readonly csl?: import("./csl.ts").CslOptions;
  readonly data?: Readonly<Record<string, unknown>>;
}
export function createSubmissionPackage(
  document: Document,
  options: LatexPackageOptions = {},
): SourcePackage {
  const resolved = resolveDocument(
    document,
    options.style ?? "numeric",
    options.csl,
  );
  if (resolved.unresolved.length)
    throw new Error(`Unresolved citations: ${resolved.unresolved.join(", ")}`);
  const registry: TemplateRegistry = {
    article: articleTemplate,
    "article-arabic": arabicTemplate,
    ...options.templates,
  };
  const template =
    typeof options.template === "object"
      ? options.template
      : Object.hasOwn(registry, options.template ?? "article")
        ? registry[options.template ?? "article"]
        : undefined;
  if (!template)
    throw new Error(
      `Unknown export template: ${typeof options.template === "string" ? options.template : "unspecified"}`,
    );
  if (options.engine && !template.engines.includes(options.engine))
    throw new Error(`Unsupported engine for ${template.id}`);
  const citationMap = new Map(
    citationClusters(resolved.article).map((cluster, index) => [
      cluster,
      resolved.citations[index] ?? "",
    ]),
  );
  const context: TemplateContext = {
    citationText: (cluster) => citationMap.get(cluster) ?? "",
    ...{
      style: options.style ?? "numeric",
      citations: resolved.citations,
      citationForm: resolved.form,
      bibliography: resolved.bibliography,
      ...(options.engine ? { engine: options.engine } : {}),
      ...(options.fonts ? { fonts: options.fonts } : {}),
      ...(options.data ? { data: options.data } : {}),
    },
  };
  const diagnostics = template.validate(resolved.article, context);
  const result = template.render(resolved.article, context);
  return {
    ...result,
    diagnostics: [...resolved.losses, ...diagnostics, ...result.diagnostics],
  };
}
/** Compatibility name for LaTeX submission generation. Templates are supplied by the host. */
export const createLatexPackage = createSubmissionPackage;
