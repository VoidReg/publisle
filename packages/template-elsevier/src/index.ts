import {
  renderLatexArticle,
  type PublishingTemplate,
} from "@publisle/template-sdk";
export const template: PublishingTemplate = {
  id: "elsevier-numeric",
  version: "1.0.0",
  format: "latex",
  engines: ["pdflatex", "lualatex"],
  languages: ["en"],
  directions: ["ltr"],
  bibliographyMode: "bibtex",
  requiredMetadata: ["title", "authors"],
  validate(article, context) {
    if (!article.title || !article.authors.length)
      throw new Error("Template requires title and authors.");

    if (context.citationForm !== "numeric")
      throw new Error("Elsevier numeric profile requires numeric citations.");
    return [];
  },
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "elsevier-numeric",
      version: "1.0.0",
      className: "elsarticle",
      classOptions: "review",
      defaultEngine: "pdflatex",
      direction: "ltr",
      bibliographyStyle: "elsarticle-num",
      frontmatter: (abstract, article, text) =>
        `\\begin{frontmatter}\n\\title{${text(article.title ?? "Untitled")}}\n${article.authors.map((name) => `\\author{${text(name)}}`).join("\n")}\n\\begin{abstract}${abstract}\\end{abstract}\n\\end{frontmatter}`,
      author: () => "",
    }),
};
export const authorDateTemplate: PublishingTemplate = {
  ...template,
  id: "elsevier-author-date",
  validate(article, context) {
    if (!article.title || !article.authors.length)
      throw new Error("Template requires title and authors.");
    if (context.citationForm !== "author-date")
      throw new Error(
        "Elsevier author-date profile requires author-date citations.",
      );
    return [];
  },
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "elsevier-author-date",
      version: "1.0.0",
      className: "elsarticle",
      classOptions: "review,authoryear",
      bibliographyStyle: "elsarticle-harv",
      citationCommand: "citep",
      defaultEngine: "pdflatex",
      author: () => "",
      frontmatter: (abstract, article, text) =>
        `\\begin{frontmatter}\\title{${text(article.title ?? "Untitled")}}${article.authors.map((name) => `\\author{${text(name)}}`).join("\n")}\\begin{abstract}${abstract}\\end{abstract}\\end{frontmatter}`,
    }),
};
