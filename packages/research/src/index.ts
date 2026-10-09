export type { CitationEntry, ResearchLoss } from "./article.ts";
export { parseBibtex, toBibtex, toCslJson } from "./bibtex.ts";
export { parseCslStyle } from "./csl.ts";
export { toJats, createJatsPackage, type JatsPackage } from "./jats.ts";
export { toLatex } from "./latex.ts";
// eslint-disable-next-line @typescript-eslint/no-deprecated -- retained migration export
export { toPdf } from "./pdf.ts";
export { resolveDocument, type ResolvedDocument } from "./resolve.ts";

export {
  createLatexPackage,
  type LatexPackage,
  type LatexPackageOptions,
  type LatexEngine,
} from "./package.ts";

export { createSubmissionPackage } from "./package.ts";

export type { CslOptions } from "./csl.ts";
