import { template } from "@publisle/template-article";
import { citationClusters } from "./article.ts";
import type { ResolvedDocument } from "./resolve.ts";
export { latexText, latexKey } from "@publisle/template-sdk";
/** Unicode article source. Use a submission package to collect referenced figure assets. */
export function toLatex(resolved: ResolvedDocument): string {
  const citations = new Map(
    citationClusters(resolved.article).map((cluster, index) => [
      cluster,
      resolved.citations[index] ?? "",
    ]),
  );
  const source = template.render(resolved.article, {
    style: resolved.form,
    citationForm: resolved.form,
    citations: resolved.citations,
    citationText: (cluster) => citations.get(cluster) ?? "",
    bibliography: resolved.bibliography,
  });
  return source.files["manuscript.tex"] ?? "";
}
