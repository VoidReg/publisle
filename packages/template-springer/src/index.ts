import { assets } from "./assets.ts";
import {
  renderLatexArticle,
  type PublishingTemplate,
} from "@publisle/template-sdk";
export const template: PublishingTemplate = {
  id: "springer-journal",
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
    if (context.citationForm !== "numeric")
      throw new Error("This journal profile requires numeric citations.");
    return [];
  },
  render: (article, context) => {
    const result = renderLatexArticle(article, context, {
      id: "springer-journal",
      version: "1.0.0",
      className: "sn-jnl",
      classOptions: "pdflatex,sn-mathphys-num",
      defaultEngine: "pdflatex",
      direction: "ltr",
      automaticBibliographyStyle: true,
      author: (article, text) =>
        `\\title{${text(article.title ?? "Untitled")}}\n${(article.authorDetails ?? []).map((author) => `\\author{${text(author.name)}}${author.affiliation ? `\\affil{${text(author.affiliation)}}` : ""}`).join("\n")}`,
      frontmatter: (abstract, article, text) =>
        `\\abstract{${abstract}}\n${article.subjects?.length ? `\\keywords{${article.subjects.map(text).join(", ")}}` : ""}\n\\maketitle`,
      bibliographyStyle: "sn-mathphys-num",
    });
    return { ...result, resources: assets };
  },
};
