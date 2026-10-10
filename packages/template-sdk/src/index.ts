export type * from "./article.ts";
export { parseBibtex, toBibtex, toCslJson } from "./bibtex.ts";
export { latexText, latexKey } from "./escape.ts";
export { renderLatexArticle } from "./render.ts";
export type { LatexProfile } from "./render.ts";
import type { Article, ResearchLoss } from "./article.ts";
export type LatexEngine = "pdflatex" | "lualatex";
export interface SourcePackage {
  /** Requested tagging, not a claim that the compiled PDF passed validation. */
  readonly pdfStandard?: "ua-1" | "ua-2";
  readonly template: string;
  readonly templateVersion: string;
  readonly format: "latex";
  readonly engine: LatexEngine;
  readonly requirements: readonly string[];
  readonly fonts: Readonly<Record<string, string>>;
  readonly files: Readonly<Record<string, string>>;
  readonly resources?: Readonly<Record<string, Uint8Array>>;
  readonly assets: readonly {
    readonly source: string;
    readonly destination: string;
  }[];
  readonly diagnostics: readonly ResearchLoss[];
}
export interface TemplateContext {
  readonly pdfUa?: "ua-1" | "ua-2" | false;
  readonly engine?: LatexEngine;
  readonly style: string;
  readonly fonts?: Readonly<Record<string, string>>;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly citations: readonly string[];
  readonly citationText?: (
    cluster: import("./article.ts").CitationCluster,
  ) => string;
  readonly citationForm: "numeric" | "author-date" | "note";
  readonly bibliography: readonly {
    readonly id: string;
    readonly label: string;
    readonly text: string;
  }[];
}
/** Trusted host code. Rendering is pure; collecting assets and running tools belong to the host. */
export interface PublishingTemplate {
  readonly id: string;
  readonly version: string;
  readonly format: "latex";
  readonly engines: readonly LatexEngine[];
  readonly languages: readonly string[];
  readonly directions: readonly ("ltr" | "rtl")[];
  readonly bibliographyMode: "csl" | "bibtex";
  readonly requiredMetadata: readonly string[];
  validate(article: Article, context: TemplateContext): readonly ResearchLoss[];
  render(article: Article, context: TemplateContext): SourcePackage;
}
export type TemplateRegistry = Readonly<Record<string, PublishingTemplate>>;
