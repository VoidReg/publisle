import type { Document } from "@publisle/schema";

export interface ResearchLoss {
  readonly code: string;
  readonly message: string;
}

export interface CitationRef {
  readonly id: string;
  readonly locator?: string;
  readonly label?: string;
  readonly suppressAuthor?: boolean;
}

export interface CitationCluster {
  readonly items: readonly CitationRef[];
  readonly prefix?: string;
  readonly suffix?: string;
}

export type ArticleInline =
  | {
      readonly type: "text";
      readonly value: string;
      readonly mark?: "emphasis" | "strong" | "code" | "strike";
    }
  | { readonly type: "math"; readonly value: string }
  | { readonly type: "link"; readonly url: string; readonly value: string }
  | { readonly type: "citation"; readonly cluster: CitationCluster }
  | { readonly type: "break" };

export interface CitationEntry {
  readonly id: string;
  readonly type?: string;
  readonly title?: string;
  readonly authors: readonly string[];
  readonly issued?: string;
  readonly containerTitle?: string;
  readonly volume?: string;
  readonly issue?: string;
  readonly page?: string;
  readonly publisher?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly raw?: string;
}

export type ArticleBlock =
  | {
      readonly kind: "heading";
      readonly level: number;
      readonly inlines: readonly ArticleInline[];
      readonly abstract: boolean;
    }
  | {
      readonly kind: "paragraph";
      readonly inlines: readonly ArticleInline[];
      readonly abstract: boolean;
    }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly ArticleInline[])[];
      readonly abstract: boolean;
    }
  | {
      readonly kind: "quote";
      readonly paragraphs: readonly (readonly ArticleInline[])[];
      readonly abstract: boolean;
    }
  | {
      readonly kind: "code";
      readonly value: string;
      readonly abstract: boolean;
    }
  | {
      readonly kind: "math";
      readonly value: string;
      readonly display: boolean;
      readonly abstract: boolean;
    }
  | {
      readonly kind: "table";
      readonly rows: readonly (readonly (readonly ArticleInline[])[])[];
      readonly abstract: boolean;
    }
  | {
      readonly kind: "footnote";
      readonly id: string;
      readonly paragraphs: readonly (readonly ArticleInline[])[];
    }
  | { readonly kind: "bibliography" };

export interface Article {
  readonly title?: string;
  readonly authors: readonly string[];
  readonly blocks: readonly ArticleBlock[];
  readonly entries: readonly CitationEntry[];
  readonly losses: readonly ResearchLoss[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pushLoss(losses: ResearchLoss[], code: string, message: string): void {
  if (losses.some((loss) => loss.code === code)) return;
  losses.push({ code, message });
}

export function readEntries(document: Document): {
  readonly entries: readonly CitationEntry[];
  readonly losses: readonly ResearchLoss[];
} {
  const entries: CitationEntry[] = [];
  const seen = new Set<string>();
  const losses: ResearchLoss[] = [];
  for (const block of document.blocks) {
    if (block.type !== "publisle:bibliography" || !isRecord(block.data))
      continue;
    const listed = block.data["entries"];
    if (!Array.isArray(listed)) continue;
    for (const entry of listed) {
      if (
        !isRecord(entry) ||
        typeof entry["id"] !== "string" ||
        entry["id"].length === 0
      )
        continue;
      const id = entry["id"];
      if (seen.has(id)) {
        pushLoss(
          losses,
          "duplicate-bibliography-entry",
          `Bibliography id ${id} is repeated. Resolution uses the first entry.`,
        );
        continue;
      }
      seen.add(id);
      const authors = Array.isArray(entry["authors"])
        ? entry["authors"].filter(
            (author): author is string => typeof author === "string",
          )
        : [];
      const type = textOf(entry["type"]);
      const title = textOf(entry["title"]);
      const issued = textOf(entry["issued"]);
      const containerTitle = textOf(entry["containerTitle"]);
      const volume = textOf(entry["volume"]);
      const issue = textOf(entry["issue"]);
      const page = textOf(entry["page"]);
      const publisher = textOf(entry["publisher"]);
      const doi = textOf(entry["doi"]);
      const url = textOf(entry["url"]);
      const raw = textOf(entry["raw"]);
      entries.push({
        id,
        authors,
        ...(type === undefined ? {} : { type }),
        ...(title === undefined ? {} : { title }),
        ...(issued === undefined ? {} : { issued }),
        ...(containerTitle === undefined ? {} : { containerTitle }),
        ...(volume === undefined ? {} : { volume }),
        ...(issue === undefined ? {} : { issue }),
        ...(page === undefined ? {} : { page }),
        ...(publisher === undefined ? {} : { publisher }),
        ...(doi === undefined ? {} : { doi }),
        ...(url === undefined ? {} : { url }),
        ...(raw === undefined ? {} : { raw }),
      });
    }
  }
  return { entries, losses };
}

function plainText(inlines: readonly ArticleInline[]): string {
  return inlines
    .map((inline) =>
      inline.type === "text" || inline.type === "link" ? inline.value : "",
    )
    .join("");
}

function citationCluster(
  value: Record<string, unknown>,
): CitationCluster | undefined {
  const items = value["items"];
  if (!Array.isArray(items)) return undefined;
  const refs: CitationRef[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item["id"] !== "string") continue;
    const locator = textOf(item["locator"]);
    const label = textOf(item["label"]);
    refs.push({
      id: item["id"],
      ...(locator === undefined ? {} : { locator }),
      ...(label === undefined ? {} : { label }),
      ...(item["suppressAuthor"] === true ? { suppressAuthor: true } : {}),
    });
  }
  if (refs.length === 0) return undefined;
  const prefix = textOf(value["prefix"]);
  const suffix = textOf(value["suffix"]);
  return {
    items: refs,
    ...(prefix === undefined ? {} : { prefix }),
    ...(suffix === undefined ? {} : { suffix }),
  };
}

function inlineList(value: unknown, losses: ResearchLoss[]): ArticleInline[] {
  if (!Array.isArray(value)) return [];
  const result: ArticleInline[] = [];
  for (const node of value) {
    if (!isRecord(node) || typeof node["type"] !== "string") continue;
    const type = node["type"];
    if (type === "text" && typeof node["value"] === "string") {
      result.push({ type: "text", value: node["value"] });
    } else if (
      (type === "emphasis" || type === "strong" || type === "strikethrough") &&
      Array.isArray(node["children"])
    ) {
      const mark = type === "strikethrough" ? "strike" : type;
      for (const child of inlineList(node["children"], losses)) {
        if (child.type === "text") result.push({ ...child, mark });
        else result.push(child);
      }
    } else if (type === "inlineCode" && typeof node["value"] === "string") {
      result.push({ type: "text", value: node["value"], mark: "code" });
    } else if (type === "inlineMath" && typeof node["value"] === "string") {
      result.push({ type: "math", value: node["value"] });
    } else if (type === "link" && typeof node["url"] === "string") {
      const label = plainText(inlineList(node["children"], losses));
      result.push({
        type: "link",
        url: node["url"],
        value: label || node["url"],
      });
    } else if (type === "inlineImage") {
      result.push({
        type: "text",
        value: typeof node["alt"] === "string" ? node["alt"] : "",
      });
    } else if (type === "hardBreak" || type === "softBreak") {
      result.push({ type: "break" });
    } else if (type === "citationReference") {
      const cluster = citationCluster(node);
      if (cluster) result.push({ type: "citation", cluster });
    } else if (
      type === "footnoteReference" &&
      typeof node["identifier"] === "string"
    ) {
      result.push({ type: "text", value: node["identifier"], mark: "code" });
    } else if (type === "crossReference") {
      const label = plainText(inlineList(node["children"], losses));
      result.push({
        type: "text",
        value:
          label || (typeof node["target"] === "string" ? node["target"] : ""),
      });
    } else if (type === "rawHtml" && typeof node["value"] === "string") {
      pushLoss(
        losses,
        "raw-html-uninterpreted",
        "Raw HTML is kept as text. Tags are not interpreted.",
      );
      result.push({
        type: "text",
        value: node["value"].replace(/<[^>]*>/gu, ""),
      });
    }
  }
  return result;
}

function flowParagraphs(
  value: unknown,
  losses: ResearchLoss[],
): ArticleInline[][] {
  if (!Array.isArray(value)) return [];
  const paragraphs: ArticleInline[][] = [];
  for (const node of value) {
    if (!isRecord(node)) continue;
    if (node["type"] === "paragraph")
      paragraphs.push(inlineList(node["content"], losses));
    else if (node["type"] === "list") {
      pushLoss(
        losses,
        "nested-list-flattened",
        "A nested list is written as following paragraphs.",
      );
      for (const item of Array.isArray(node["items"]) ? node["items"] : []) {
        if (!isRecord(item)) continue;
        paragraphs.push(...flowParagraphs(item["children"], losses));
      }
    } else {
      paragraphs.push(...flowParagraphs(node["children"], losses));
    }
  }
  return paragraphs;
}

export function projectArticle(document: Document): Article {
  const losses: ResearchLoss[] = [];
  const read = readEntries(document);
  losses.push(...read.losses);
  const blocks: ArticleBlock[] = [];
  let abstract = false;
  const authors = (document.metadata?.authors ?? []).map(
    (author) => author.name,
  );
  for (const block of document.blocks) {
    const data = isRecord(block.data) ? block.data : {};
    if (block.type === "publisle:heading") {
      const role = data["role"];
      abstract = role === "abstract";
      const level = typeof data["level"] === "number" ? data["level"] : 1;
      blocks.push({
        kind: "heading",
        level,
        inlines: inlineList(data["content"], losses),
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:paragraph") {
      blocks.push({
        kind: "paragraph",
        inlines: inlineList(data["content"], losses),
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:list" && Array.isArray(data["items"])) {
      blocks.push({
        kind: "list",
        ordered: data["ordered"] === true,
        items: data["items"].map((item) => {
          const children = isRecord(item) ? item["children"] : [];
          return flowParagraphs(children, losses).flat();
        }),
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:quote") {
      blocks.push({
        kind: "quote",
        paragraphs: flowParagraphs(data["children"], losses),
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:code" && typeof data["value"] === "string") {
      blocks.push({ kind: "code", value: data["value"], abstract });
      continue;
    }
    if (block.type === "publisle:math" && typeof data["value"] === "string") {
      blocks.push({
        kind: "math",
        value: data["value"],
        display: data["display"] === true,
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:table" && Array.isArray(data["rows"])) {
      pushLoss(
        losses,
        "table-rendered-as-text",
        "Tables are written as text rows. Column alignment is not a journal layout.",
      );
      blocks.push({
        kind: "table",
        rows: data["rows"].map((row) =>
          Array.isArray(row) ? row.map((cell) => inlineList(cell, losses)) : [],
        ),
        abstract,
      });
      continue;
    }
    if (
      block.type === "publisle:footnote" &&
      typeof data["identifier"] === "string"
    ) {
      blocks.push({
        kind: "footnote",
        id: data["identifier"],
        paragraphs: flowParagraphs(data["children"], losses),
      });
      continue;
    }
    if (block.type === "publisle:bibliography") {
      blocks.push({ kind: "bibliography" });
      continue;
    }
    if (block.type === "publisle:figure") {
      const caption = flowParagraphs(data["caption"], losses).flat();
      const alt = textOf(data["alt"]);
      blocks.push({
        kind: "paragraph",
        inlines: [
          ...(alt ? [{ type: "text" as const, value: alt }] : []),
          ...caption,
        ],
        abstract,
      });
      continue;
    }
    if (block.type === "publisle:callout") {
      for (const paragraph of flowParagraphs(data["children"], losses)) {
        blocks.push({ kind: "paragraph", inlines: paragraph, abstract });
      }
      continue;
    }
    if (
      block.type === "publisle:embed" ||
      block.type === "publisle:diagram" ||
      block.type === "publisle:raw-html"
    ) {
      pushLoss(
        losses,
        "research-block-reduced",
        "Embeds, diagrams, and raw HTML contribute their readable text. Their behavior is not executed.",
      );
      const fallback = flowParagraphs(data["fallback"], losses).flat();
      const alt = textOf(data["alt"]) ?? textOf(data["title"]);
      const source = textOf(data["value"]);
      blocks.push({
        kind: "paragraph",
        inlines: [
          ...(alt ? [{ type: "text" as const, value: alt }] : []),
          ...fallback,
          ...(source
            ? [
                {
                  type: "text" as const,
                  value: source.replace(/<[^>]*>/gu, ""),
                },
              ]
            : []),
        ],
        abstract,
      });
    }
  }
  const title = document.metadata?.title;
  return {
    authors,
    blocks,
    entries: read.entries,
    losses,
    ...(title === undefined ? {} : { title }),
  };
}

export function citationClusters(article: Article): CitationCluster[] {
  const clusters: CitationCluster[] = [];
  const visit = (inlines: readonly ArticleInline[]) => {
    for (const inline of inlines) {
      if (inline.type === "citation") clusters.push(inline.cluster);
    }
  };
  for (const block of article.blocks) {
    if (block.kind === "heading" || block.kind === "paragraph")
      visit(block.inlines);
    else if (block.kind === "list") for (const item of block.items) visit(item);
    else if (block.kind === "quote" || block.kind === "footnote")
      for (const paragraph of block.paragraphs) visit(paragraph);
    else if (block.kind === "table")
      for (const row of block.rows) for (const cell of row) visit(cell);
  }
  return clusters;
}
