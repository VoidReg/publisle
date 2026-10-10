import subset from "@publisle/contracts/citation-subset" with { type: "json" };
import { isPlainObject, type Document } from "@publisle/schema";
import { resolveDocument } from "./resolve.ts";

export const PORTABLE_CITATION_CAPABILITIES = Object.freeze({
  ...subset.capabilities,
  styles: Object.freeze([...subset.capabilities.styles]),
  locales: Object.freeze([...subset.capabilities.locales]),
});

export interface PortableCitations {
  readonly classification: "rendered" | "fallback-with-diagnostic" | "rejected";
  readonly capabilities: typeof PORTABLE_CITATION_CAPABILITIES;
  readonly citations: readonly string[];
  readonly bibliography: readonly { id: string; label: string; text: string }[];
  readonly unresolved: readonly string[];
  readonly diagnostics: readonly { code: string; message: string }[];
}

const matches = (pattern: string, value: string) =>
  new RegExp(pattern, "u").exec(value)?.[0] === value;
// eslint-disable-next-line no-control-regex -- controls are excluded from this plain-text subset
const forbiddenText = /[<>\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u;
const text = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= subset.limits.text &&
  !forbiddenText.test(value);
const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();

/** A bounded role shared with the independent Python implementation, not a full CSL processor. */
export function portableCitationLimit(
  document: unknown,
  style: string,
  locale: string,
): string | undefined {
  if (!subset.capabilities.styles.includes(style))
    return "Only built-in numeric and author-date styles are supported.";
  if (!subset.capabilities.locales.includes(locale))
    return "This citation locale is outside the shared subset.";
  if (
    !isPlainObject(document) ||
    document["schemaVersion"] !== 1 ||
    !Array.isArray(document["blocks"]) ||
    document["blocks"].length > subset.limits.blocks ||
    document["dependencies"] !== undefined
  )
    return "Expected an unlocked v1 citation document within the shared budget.";
  const entries: Record<string, unknown>[] = [];
  const suppressed = new Set<string>();
  let clusters = 0;
  const inline = (nodes: unknown, depth = 0): boolean => {
    if (
      !Array.isArray(nodes) ||
      nodes.length > subset.limits.clusters ||
      depth > 16
    )
      return false;
    return nodes.every((node: unknown) => {
      if (
        !isPlainObject(node) ||
        typeof node["type"] !== "string" ||
        !subset.inlineTypes.includes(node["type"])
      )
        return false;
      if (["strong", "emphasis", "strikethrough"].includes(node["type"]))
        return inline(node["children"], depth + 1);
      if (node["type"] !== "citationReference")
        return ["hardBreak", "softBreak"].includes(node["type"])
          ? node["value"] === undefined || text(node["value"])
          : text(node["value"]);
      clusters += 1;
      const items = node["items"];
      if (
        clusters > subset.limits.clusters ||
        !Array.isArray(items) ||
        !items.length ||
        items.length > subset.limits.items
      )
        return false;
      const ids = new Set<string>();
      if (
        ![node["prefix"], node["suffix"]].every(
          (value) => value === undefined || text(value),
        )
      )
        return false;
      return items.every((item: unknown) => {
        if (
          !isPlainObject(item) ||
          !text(item["id"]) ||
          !item["id"] ||
          ids.has(item["id"])
        )
          return false;
        ids.add(item["id"]);
        if (item["suppressAuthor"] === true) suppressed.add(item["id"]);
        if (
          Object.keys(item).some(
            (key) =>
              !["id", "locator", "label", "suppressAuthor"].includes(key),
          )
        )
          return false;
        return (
          (item["locator"] === undefined ||
            (text(item["locator"]) &&
              matches(subset.rangePattern, item["locator"]))) &&
          (item["label"] === undefined ||
            (text(item["label"]) &&
              subset.locatorLabels.includes(item["label"]))) &&
          (item["suppressAuthor"] === undefined ||
            typeof item["suppressAuthor"] === "boolean")
        );
      });
    });
  };
  for (const block of document["blocks"] as unknown[]) {
    if (
      !isPlainObject(block) ||
      block["schemaVersion"] !== 1 ||
      typeof block["type"] !== "string" ||
      !subset.blockTypes.includes(block["type"]) ||
      !isPlainObject(block["data"])
    )
      return "This citation document shape is outside the shared subset.";
    const data = block["data"];
    if (block["type"] === "publisle:bibliography") {
      if (!Array.isArray(data["entries"]))
        return "Bibliography entries must be an array.";
      if (entries.length + data["entries"].length > subset.limits.entries)
        return "Too many bibliography entries.";
      for (const entry of data["entries"] as unknown[]) {
        if (
          !isPlainObject(entry) ||
          Object.keys(entry).some((key) => !subset.entryFields.includes(key)) ||
          !text(entry["id"]) ||
          !entry["id"]
        )
          return "Unsupported bibliography entry.";
        for (const [key, value] of Object.entries(entry))
          if (key !== "authors" && !text(value))
            return "Bibliography fields must be bounded plain text.";
        for (const [key, value] of Object.entries(entry))
          if (
            key !== "id" &&
            typeof value === "string" &&
            new RegExp(subset.quotationPattern, "u").test(value)
          )
            return "CSL quotation processing is outside the shared subset.";
        const authors = entry["authors"] === undefined ? [] : entry["authors"];
        if (
          !Array.isArray(authors) ||
          authors.length > subset.limits.authors ||
          !authors.every(
            (author) => text(author) && matches(subset.namePattern, author),
          )
        )
          return "Names require the shared Family or Family, Given representation.";
        if (
          entry["issued"] !== undefined &&
          (!text(entry["issued"]) ||
            !matches(subset.yearPattern, entry["issued"]))
        )
          return "Only four-digit Common Era years are supported.";
        if (
          entry["page"] !== undefined &&
          (!text(entry["page"]) || !matches(subset.rangePattern, entry["page"]))
        )
          return "Page ranges are outside the shared subset.";
        if (
          typeof entry["raw"] === "string" &&
          entry["raw"].trimStart().startsWith("@")
        )
          return "BibTeX acquisition is outside the portable citation role.";
        if (!entry["title"] && !entry["raw"])
          return "A title or literal reference is required.";
        if (style === "author-date" && !authors.length && !entry["issued"])
          return "Author-date references need an author or year.";
        entries.push(entry);
      }
    } else if (!inline(data["content"]))
      return "Inline citation content is outside the shared subset.";
  }
  if (entries.length > subset.limits.entries)
    return "Too many bibliography entries.";
  if (style === "author-date") {
    const first = new Map<string, Record<string, unknown>>();
    for (const entry of entries)
      if (!first.has(String(entry["id"])))
        first.set(String(entry["id"]), entry);
    for (const id of suppressed)
      if (first.has(id) && !first.get(id)?.["issued"])
        return "Author suppression requires a year in the shared subset.";
  }
  // Avoid claiming the general CSL given-name/coauthor disambiguation algorithm.
  const ambiguities = new Map<string, string>();
  for (const entry of entries) {
    const authors = (entry["authors"] ?? []) as string[];
    const short = (authors.length >= 3 ? authors.slice(0, 1) : authors).map(
      (name) => name.split(",")[0],
    );
    const key = JSON.stringify([short, authors.length >= 3, entry["issued"]]);
    const full = JSON.stringify(authors);
    if (
      style === "author-date" &&
      ambiguities.has(key) &&
      ambiguities.get(key) !== full
    )
      return "Given-name and coauthor disambiguation is outside the shared subset.";
    ambiguities.set(key, full);
  }
  return undefined;
}

export function resolvePortableCitations(
  document: unknown,
  style = "numeric",
  locale = "en-US",
): PortableCitations {
  const limit = portableCitationLimit(document, style, locale);
  if (limit)
    return {
      classification: "rejected",
      capabilities: PORTABLE_CITATION_CAPABILITIES,
      citations: [],
      bibliography: [],
      unresolved: [],
      diagnostics: [{ code: "unsupported-citation-feature", message: limit }],
    };
  const source = document as Document;
  // Metadata does not participate in this citation-only role.
  const resolved = resolveDocument(
    { schemaVersion: 1, blocks: source.blocks },
    style,
    { locale },
  );
  return {
    classification: resolved.losses.length
      ? "fallback-with-diagnostic"
      : "rendered",
    capabilities: PORTABLE_CITATION_CAPABILITIES,
    citations: resolved.citations.map(normalize),
    bibliography: resolved.bibliography.map((item) => ({
      ...item,
      text: normalize(item.text),
    })),
    unresolved: resolved.unresolved,
    diagnostics: resolved.losses,
  };
}
