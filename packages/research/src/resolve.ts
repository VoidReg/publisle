import type { Document } from "@publisle/schema";
import {
  citationClusters,
  projectArticle,
  type Article,
  type ResearchLoss,
} from "./article.ts";
import {
  builtinCsl,
  formatCitations,
  parseCslStyle,
  type CitationForm,
  type FormattedResearch,
} from "./csl.ts";

export interface ResolvedDocument extends FormattedResearch {
  readonly article: Article;
  readonly losses: readonly ResearchLoss[];
}

export function resolveDocument(
  document: Document,
  style = "numeric",
): ResolvedDocument {
  const article = projectArticle(document);
  const parsed =
    style === "numeric" || style === "author-date"
      ? builtinCsl(style)
      : parseCslStyle(style);
  const formatted = formatCitations(
    article.entries,
    citationClusters(article),
    parsed,
  );
  return {
    ...formatted,
    article,
    losses: [...article.losses, ...formatted.losses],
  };
}

export type { CitationForm };
