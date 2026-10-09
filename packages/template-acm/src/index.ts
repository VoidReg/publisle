import {
  renderLatexArticle,
  type PublishingTemplate,
} from "@publisle/template-sdk";
export const template: PublishingTemplate = {
  id: "acm-journal",
  version: "1.0.0",
  format: "latex",
  engines: ["pdflatex"],
  languages: ["en"],
  directions: ["ltr"],
  bibliographyMode: "bibtex",
  requiredMetadata: ["title", "authors"],
  validate(article, context) {
    if (!article.title || !article.authors.length)
      throw new Error("Template requires title and authors.");

    if (
      (article.authorDetails ?? []).some((author) => author.affiliation) &&
      typeof context.data?.["country"] !== "string"
    )
      throw new Error("ACM affiliations require template data: country.");
    return [];
  },
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "acm-journal",
      version: "1.0.0",
      className: "acmart",
      classOptions: "manuscript,review",
      defaultEngine: "pdflatex",
      direction: "ltr",
      bibliographyStyle: "ACM-Reference-Format",
      author: (article, text) =>
        `\\title{${text(article.title ?? "Untitled")}}\n${(article.authorDetails ?? []).map((author) => `\\author{${text(author.name)}}${author.affiliation ? `\\affiliation{\\institution{${text(author.affiliation)}}\\country{${text(typeof context.data?.["country"] === "string" ? context.data["country"] : "")}}}` : ""}`).join("\n")}`,
      frontmatter: (abstract) =>
        `\\begin{abstract}${abstract}\\end{abstract}\n\\maketitle`,
      preamble:
        "\\setcopyright{none}\n\\acmDOI{}\n\\acmISBN{}\n\\settopmatter{printacmref=false}\n\\renewcommand\\footnotetextcopyrightpermission[1]{}",
    }),
};
