export const LIMITS = Object.freeze({
  requestBytes: 256 * 1024,
  imageCount: 12,
  imageBytes: 4 * 1024 * 1024,
  totalImageBytes: 16 * 1024 * 1024,
  imagePixels: 8_000_000,
  pdfBytes: 16 * 1024 * 1024,
  queueSize: 2,
  queueMs: 30_000,
  jobMs: 180_000,
  fetchMs: 10_000,
  redirects: 3,
  attempts: 5,
  quotaMs: 600_000,
});

export class ServiceError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const TEMPLATES = Object.freeze([
  {
    id: "article",
    label: "Article",
    engines: ["lualatex", "pdflatex"],
    style: "numeric",
  },
  {
    id: "article-arabic",
    label: "Arabic article",
    engines: ["lualatex"],
    style: "numeric",
  },
  {
    id: "ieee-journal",
    label: "IEEE journal",
    engines: ["pdflatex", "lualatex"],
    style: "numeric",
  },
  {
    id: "acm-journal",
    label: "ACM journal",
    engines: ["pdflatex"],
    style: "numeric",
    fields: ["country"],
  },
  {
    id: "springer-journal",
    label: "Springer journal",
    engines: ["pdflatex"],
    style: "numeric",
  },
  {
    id: "elsevier-numeric",
    label: "Elsevier numeric",
    engines: ["pdflatex", "lualatex"],
    style: "numeric",
  },
  {
    id: "elsevier-author-date",
    label: "Elsevier author-date",
    engines: ["pdflatex"],
    style: "author-date",
  },
]);

export function validateRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ServiceError("invalid-request", "Expected a JSON object.", 400);
  const hasDocument = Object.hasOwn(value, "document");
  const hasMarkdown = Object.hasOwn(value, "markdown");
  if (
    hasDocument === hasMarkdown ||
    (hasMarkdown && typeof value.markdown !== "string")
  )
    throw new ServiceError(
      "invalid-request",
      "Supply exactly one document or Markdown source.",
      400,
    );
  const template = TEMPLATES.find(
    (entry) => entry.id === (value.template ?? "article"),
  );
  if (
    !template ||
    (value.engine !== undefined && !template.engines.includes(value.engine))
  )
    throw new ServiceError(
      "invalid-template",
      "Choose a supported template and engine.",
      400,
    );
  const data = value.data ?? {};
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).some((key) => key !== "country") ||
    (data.country !== undefined &&
      (typeof data.country !== "string" || data.country.length > 100))
  )
    throw new ServiceError(
      "invalid-metadata",
      "Unsupported template metadata.",
      400,
    );
  return {
    ...(hasDocument
      ? { document: value.document }
      : { markdown: value.markdown }),
    template: template.id,
    engine: value.engine ?? template.engines[0],
    style: template.style,
    data,
  };
}
