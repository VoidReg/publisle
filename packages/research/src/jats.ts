import type { ArticleInline } from "./article.ts";
import type { ResolvedDocument } from "./resolve.ts";

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineJats(
  inlines: readonly ArticleInline[],
  resolved: ResolvedDocument,
  cursor: { index: number },
): string {
  return inlines
    .map((inline) => {
      if (inline.type === "break") return "<break/>";
      if (inline.type === "math")
        return `<inline-formula><tex-math><![CDATA[${inline.value}]]></tex-math></inline-formula>`;
      if (inline.type === "link")
        return `<ext-link ext-link-type="uri" xlink:href="${xml(inline.url)}">${xml(inline.value)}</ext-link>`;
      if (inline.type === "citation") {
        const text = resolved.citations[cursor.index] ?? "";
        cursor.index += 1;
        const rid = inline.cluster.items.map((item) => item.id).join(" ");
        return `<xref ref-type="bibr" rid="${xml(rid)}">${xml(text)}</xref>`;
      }
      const value = xml(inline.value);
      if (inline.mark === "emphasis") return `<italic>${value}</italic>`;
      if (inline.mark === "strong") return `<bold>${value}</bold>`;
      if (inline.mark === "code") return `<monospace>${value}</monospace>`;
      if (inline.mark === "strike") return `<strike>${value}</strike>`;
      return value;
    })
    .join("");
}

function publicationType(type: string | undefined): string {
  if (type === "article-journal") return "journal";
  if (type === "book") return "book";
  if (type === "paper-conference") return "confproc";
  return "other";
}

function name(author: string): string {
  const comma = author.indexOf(",");
  const surname = xml((comma === -1 ? author : author.slice(0, comma)).trim());
  const given = comma === -1 ? "" : author.slice(comma + 1).trim();
  return `<name><surname>${surname}</surname>${given.length === 0 ? "" : `<given-names>${xml(given)}</given-names>`}</name>`;
}

/** JATS Archiving 1.3 article XML. It is not a publisher submission bundle. */
export function toJats(resolved: ResolvedDocument): string {
  const cursor = { index: 0 };
  const take = (inlines: readonly ArticleInline[]) =>
    inlineJats(inlines, resolved, cursor);
  const abstract: string[] = [];
  const body: string[] = [];
  const footnotes: string[] = [];
  for (const block of resolved.article.blocks) {
    const target =
      block.kind !== "footnote" &&
      block.kind !== "bibliography" &&
      block.abstract
        ? abstract
        : body;
    if (block.kind === "heading") {
      if (!block.abstract)
        target.push(`<sec><title>${take(block.inlines)}</title></sec>`);
      else abstract.push(`<title>${take(block.inlines)}</title>`);
    } else if (block.kind === "paragraph")
      target.push(`<p>${take(block.inlines)}</p>`);
    else if (block.kind === "list") {
      target.push(
        `<list list-type="${block.ordered ? "order" : "bullet"}">${block.items
          .map((item) => `<list-item><p>${take(item)}</p></list-item>`)
          .join("")}</list>`,
      );
    } else if (block.kind === "quote") {
      target.push(
        `<disp-quote>${block.paragraphs.map((paragraph) => `<p>${take(paragraph)}</p>`).join("")}</disp-quote>`,
      );
    } else if (block.kind === "code")
      target.push(`<preformat>${xml(block.value)}</preformat>`);
    else if (block.kind === "math")
      target.push(
        `<disp-formula><tex-math><![CDATA[${block.value}]]></tex-math></disp-formula>`,
      );
    else if (block.kind === "table") {
      const rows = block.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${take(cell)}</td>`).join("")}</tr>`,
        )
        .join("");
      target.push(`<table-wrap><table>${rows}</table></table-wrap>`);
    } else if (block.kind === "footnote") {
      footnotes.push(
        `<fn id="${xml(block.id)}"><p>${block.paragraphs.map((paragraph) => take(paragraph)).join(" ")}</p></fn>`,
      );
    }
  }
  const entryById = new Map(
    resolved.article.entries.map((entry) => [entry.id, entry]),
  );
  const refs = resolved.bibliography
    .map((item) => {
      const entry = entryById.get(item.id);
      const pages = (entry?.page ?? "").split(/--|-|–/u);
      const first = pages[0]?.trim() ?? "";
      const last = pages[1]?.trim();
      return `<ref id="${xml(item.id)}"><element-citation publication-type="${publicationType(entry?.type)}">${
        entry && entry.authors.length > 0
          ? `<person-group person-group-type="author">${entry.authors.map(name).join("")}</person-group>`
          : ""
      }${entry?.title === undefined ? "" : `<article-title>${xml(entry.title)}</article-title>`}${
        entry?.containerTitle === undefined
          ? ""
          : `<source>${xml(entry.containerTitle)}</source>`
      }${entry?.issued === undefined ? "" : `<year>${xml(entry.issued.slice(0, 4))}</year>`}${
        entry?.volume === undefined
          ? ""
          : `<volume>${xml(entry.volume)}</volume>`
      }${entry?.issue === undefined ? "" : `<issue>${xml(entry.issue)}</issue>`}${
        first.length === 0 ? "" : `<fpage>${xml(first)}</fpage>`
      }${last === undefined || last.length === 0 ? "" : `<lpage>${xml(last)}</lpage>`}${
        entry?.doi === undefined
          ? ""
          : `<pub-id pub-id-type="doi">${xml(entry.doi)}</pub-id>`
      }</element-citation></ref>`;
    })
    .join("");
  const authors = resolved.article.authors
    .map(
      (author) =>
        `<contrib contrib-type="author"><name><surname>${xml(author)}</surname></name></contrib>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns="https://jats.nlm.nih.gov/ns/archiving/1.3/" xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article" dtd-version="1.3">
<front><article-meta>
<title-group><article-title>${xml(resolved.article.title ?? "Untitled")}</article-title></title-group>
${authors.length === 0 ? "" : `<contrib-group>${authors}</contrib-group>`}
${abstract.length === 0 ? "" : `<abstract>${abstract.join("")}</abstract>`}
</article-meta></front>
<body>${body.join("")}</body>
<back>
${footnotes.length === 0 ? "" : `<fn-group>${footnotes.join("")}</fn-group>`}
<ref-list>${refs}</ref-list>
</back>
</article>
`;
}
