import {
  citationKey,
  type AdapterCompilerOptions,
} from "@publisle/adapter-core";
import { citationClusters, resolveDocument } from "@publisle/research";
import type { Document } from "@publisle/schema";

/** Loaded by the editor only; publication readers never load CSL tooling. */
export function previewCitations(document: Document): AdapterCompilerOptions {
  const resolved = resolveDocument(document, "numeric");
  const citations: Record<string, string> = {};
  citationClusters(resolved.article).forEach((cluster, index) => {
    const value = resolved.citations[index];
    citations[citationKey(cluster)] = value;
  });
  return { citations, bibliography: resolved.bibliography };
}
