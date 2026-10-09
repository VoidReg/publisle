import {
  renderLatexArticle,
  type PublishingTemplate,
} from "@publisle/template-sdk";
export const template: PublishingTemplate = {
  id: "ieee-journal",
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
      throw new Error("This journal profile requires numeric citations.");
    return [];
  },
  render: (article, context) =>
    renderLatexArticle(article, context, {
      id: "ieee-journal",
      version: "1.0.0",
      className: "IEEEtran",
      classOptions: "journal,10pt,letterpaper",
      defaultEngine: "pdflatex",
      direction: "ltr",
      bibliographyStyle: "IEEEtran",
      numericCitationPackage: true,
      pdfSymbols: true,
      keywords: (subjects, text) =>
        subjects.length
          ? `\\begin{IEEEkeywords}${subjects.map(text).join(", ")}\\end{IEEEkeywords}`
          : "",
    }),
};
