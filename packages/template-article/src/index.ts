import {
  renderLatexArticle,
  type PublishingTemplate,
} from "@publisle/template-sdk";
export const template: PublishingTemplate = {
  id: "article",
  version: "1.0.0",
  format: "latex",
  engines: ["pdflatex", "lualatex"],
  languages: ["en"],
  directions: ["ltr"],
  bibliographyMode: "csl",
  requiredMetadata: ["title", "authors"],
  validate(article, _context) {
    if (!article.title || !article.authors.length)
      throw new Error("Template requires title and authors.");

    return [];
  },
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "article",
      version: "1.0.0",
      className: "article",
      classOptions: "11pt,a4paper",
      defaultEngine: "lualatex",
      direction: "ltr",
    }),
};
export const arabicTemplate: PublishingTemplate = {
  ...template,
  id: "article-arabic",
  engines: ["lualatex"],
  languages: ["ar"],
  directions: ["rtl"],
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "article-arabic",
      version: "1.0.0",
      className: "article",
      classOptions: "11pt,a4paper",
      defaultEngine: "lualatex",
      direction: "rtl",
    }),
};
