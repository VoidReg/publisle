import type {
  CitationCluster,
  CitationEntry,
  ResearchLoss,
} from "./article.ts";

export interface XmlElement {
  readonly type: "element";
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}
export type XmlNode =
  XmlElement | { readonly type: "text"; readonly value: string };

const NUMERIC_STYLE = `<?xml version="1.0"?>
<style class="in-text" version="1.0">
  <info><title>Publisle numeric</title><category citation-format="numeric"/></info>
  <citation collapse="citation-number">
    <sort><key variable="citation-number"/></sort>
    <layout prefix="[" suffix="]" delimiter=", ">
      <text variable="citation-number"/>
    </layout>
  </citation>
  <bibliography>
    <layout>
      <text variable="citation-number" suffix=". "/>
      <names variable="author"><name form="long" and="text" delimiter=", "/><et-al term="et-al"/></names>
      <text variable="title" prefix=", "/>
      <text variable="container-title" prefix=", "/>
      <text variable="volume" prefix=" "/>
      <text variable="issue" prefix="(" suffix=")"/>
      <text variable="page" prefix=": "/>
      <date variable="issued" prefix=" (" suffix=")"><date-part name="year"/></date>
      <text variable="DOI" prefix=". https://doi.org/"/>
    </layout>
  </bibliography>
</style>`;

const AUTHOR_DATE_STYLE = `<?xml version="1.0"?>
<style class="in-text" version="1.0">
  <info><title>Publisle author-date</title><category citation-format="author-date"/></info>
  <macro name="author-short">
    <names variable="author">
      <name form="short" and="symbol" delimiter=", "/>
      <et-al term="et-al"/>
    </names>
  </macro>
  <citation et-al-min="3" et-al-use-first="1">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <text macro="author-short"/>
        <date variable="issued"><date-part name="year"/></date>
      </group>
    </layout>
  </citation>
  <bibliography>
    <sort><key variable="author"/><key variable="issued"/></sort>
    <layout suffix=".">
      <names variable="author"><name and="text" name-as-sort-order="first" delimiter=", "/></names>
      <date variable="issued" prefix=" (" suffix=")"/>
      <text variable="title" prefix=". "/>
      <text variable="container-title" prefix=". "/>
    </layout>
  </bibliography>
</style>`;

interface CslItem {
  readonly entry: CitationEntry;
  readonly number: number;
  readonly locator?: string;
  readonly label?: string;
  readonly suppressAuthor: boolean;
  readonly yearSuffix: string;
}

function parseXml(source: string): XmlElement {
  let index = 0;
  const skip = () => {
    while (index < source.length) {
      if (source.startsWith("<?", index) || source.startsWith("<!", index)) {
        const end = source.indexOf(">", index);
        if (end === -1) throw new Error("CSL declaration is not closed.");
        index = end + 1;
        continue;
      }
      if (source.startsWith("<!--", index)) {
        const end = source.indexOf("-->", index);
        if (end === -1) throw new Error("CSL comment is not closed.");
        index = end + 3;
        continue;
      }
      if (/\s/u.test(source[index] ?? "")) {
        index += 1;
        continue;
      }
      break;
    }
  };
  const readAttributes = (): Record<string, string> => {
    const attributes: Record<string, string> = {};
    while (
      index < source.length &&
      source[index] !== ">" &&
      source[index] !== "/"
    ) {
      if (/\s/u.test(source[index] ?? "")) {
        index += 1;
        continue;
      }
      const nameEnd = source.slice(index).search(/[\s=/>]/u);
      if (nameEnd <= 0) throw new Error("CSL attribute name is missing.");
      const name = source.slice(index, index + nameEnd);
      index += nameEnd;
      while (/\s/u.test(source[index] ?? "")) index += 1;
      if (source[index] !== "=")
        throw new Error(`CSL attribute ${name} is missing a value.`);
      index += 1;
      while (/\s/u.test(source[index] ?? "")) index += 1;
      const quote = source[index];
      if (quote !== '"' && quote !== "'")
        throw new Error(`CSL attribute ${name} is not quoted.`);
      const valueEnd = source.indexOf(quote, index + 1);
      if (valueEnd === -1)
        throw new Error(`CSL attribute ${name} is not closed.`);
      attributes[name] = source.slice(index + 1, valueEnd);
      index = valueEnd + 1;
    }
    return attributes;
  };
  const readNodes = (until: string): XmlNode[] => {
    const children: XmlNode[] = [];
    while (index < source.length && !source.startsWith(until, index)) {
      if (source[index] === "<") children.push(readElement());
      else {
        const next = source.indexOf("<", index);
        const value = source.slice(index, next === -1 ? source.length : next);
        index = next === -1 ? source.length : next;
        if (value.trim().length > 0)
          children.push({ type: "text", value: value.trim() });
      }
    }
    return children;
  };
  const readElement = (): XmlElement => {
    if (source[index] !== "<") throw new Error("Expected a CSL element.");
    index += 1;
    const nameEnd = source.slice(index).search(/[\s/>]/u);
    if (nameEnd <= 0) throw new Error("CSL element name is missing.");
    const name = source.slice(index, index + nameEnd);
    index += nameEnd;
    const attributes = readAttributes();
    if (source.startsWith("/>", index)) {
      index += 2;
      return { type: "element", name, attributes, children: [] };
    }
    if (source[index] !== ">")
      throw new Error(`CSL element ${name} is not closed.`);
    index += 1;
    const children = readNodes(`</${name}>`);
    if (!source.startsWith(`</${name}>`, index))
      throw new Error(`CSL element ${name} has no end tag.`);
    index += name.length + 3;
    return { type: "element", name, attributes, children };
  };
  skip();
  const root = readElement();
  skip();
  if (index < source.length) throw new Error("CSL style has trailing content.");
  if (root.name !== "style") throw new Error("CSL root element must be style.");
  return root;
}

export function builtinCsl(name: "numeric" | "author-date"): XmlElement {
  return parseXml(name === "numeric" ? NUMERIC_STYLE : AUTHOR_DATE_STYLE);
}

export function parseCslStyle(xml: string): XmlElement {
  return parseXml(xml);
}

function elements(node: XmlElement, name: string): XmlElement[] {
  return node.children.filter(
    (child): child is XmlElement =>
      child.type === "element" && child.name === name,
  );
}

function descendants(node: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.name === name) found.push(child);
    found.push(...descendants(child, name));
  }
  return found;
}

function attr(node: XmlElement, name: string): string | undefined {
  return node.attributes[name];
}

export type CitationForm = "numeric" | "author-date" | "note";

export function citationForm(style: XmlElement): CitationForm {
  const category = descendants(style, "category").find((item) =>
    attr(item, "citation-format"),
  );
  const format = category ? attr(category, "citation-format") : undefined;
  if (format === "numeric") return "numeric";
  if (format === "author-date") return "author-date";
  return "note";
}

function family(author: string): string {
  const comma = author.indexOf(",");
  return (comma === -1 ? author : author.slice(0, comma)).trim();
}

function given(author: string): string {
  const comma = author.indexOf(",");
  return comma === -1 ? "" : author.slice(comma + 1).trim();
}

function yearOf(entry: CitationEntry): string {
  const match = /(\d{4})/u.exec(entry.issued ?? "");
  return match?.[1] ?? "";
}

function pushLoss(losses: ResearchLoss[], code: string, message: string): void {
  if (!losses.some((loss) => loss.code === code))
    losses.push({ code, message });
}

interface RenderState {
  readonly macros: ReadonlyMap<string, readonly XmlNode[]>;
  readonly form: CitationForm;
  readonly losses: ResearchLoss[];
  readonly mode: "citation" | "bibliography";
  readonly etAlMin?: number;
  readonly etAlUseFirst: number;
  depth: number;
  locatorUsed: boolean;
}

function variable(item: CslItem, name: string): string {
  const entry = item.entry;
  switch (name) {
    case "title":
      return entry.title ?? "";
    case "container-title":
      return entry.containerTitle ?? "";
    case "volume":
      return entry.volume ?? "";
    case "issue":
      return entry.issue ?? "";
    case "page":
      return entry.page ?? "";
    case "publisher":
      return entry.publisher ?? "";
    case "DOI":
      return entry.doi ?? "";
    case "URL":
      return entry.url ?? "";
    case "citation-number":
      return String(item.number);
    case "citation-label":
      return entry.id;
    case "locator":
      return item.locator ?? "";
    case "issued":
      return `${yearOf(entry)}${item.yearSuffix}`;
    default:
      return "";
  }
}

function formatNames(
  node: XmlElement,
  item: CslItem,
  state: RenderState,
): string {
  if (item.suppressAuthor) return "";
  const name = elements(node, "name")[0];
  const etAl = elements(node, "et-al")[0];
  const authors = [...item.entry.authors];
  const minimum = numberAttr(node, "et-al-min") ?? state.etAlMin;
  const useFirst = numberAttr(node, "et-al-use-first") ?? state.etAlUseFirst;
  const shown =
    minimum !== undefined && authors.length >= minimum
      ? authors.slice(0, useFirst)
      : authors;
  const truncated = shown.length < authors.length;
  const form = name ? attr(name, "form") : undefined;
  const sort = name ? attr(name, "name-as-sort-order") : undefined;
  const delimiter = (name ? attr(name, "delimiter") : undefined) ?? ", ";
  const and = name ? attr(name, "and") : undefined;
  const rendered = shown.map((author) => {
    if (form === "short") return family(author);
    if (sort === "first" || sort === "all") {
      const rest = given(author);
      return rest.length === 0 ? family(author) : `${family(author)}, ${rest}`;
    }
    const rest = given(author);
    return rest.length === 0 ? family(author) : `${rest} ${family(author)}`;
  });
  let text = rendered.join(delimiter);
  if (rendered.length > 1 && and !== undefined) {
    const joiner = and === "symbol" ? " & " : " and ";
    const head = rendered.slice(0, -1).join(delimiter);
    const tail = rendered[rendered.length - 1] ?? "";
    text = head.length === 0 ? tail : `${head}${joiner}${tail}`;
  }
  if (truncated) {
    const term = etAl ? attr(etAl, "term") : undefined;
    if (term !== undefined && term !== "et-al")
      pushLoss(
        state.losses,
        "csl-locale-term",
        "CSL locale terms other than et-al use the term name as written.",
      );
    text = `${text} ${term === undefined || term === "et-al" ? "et al." : term}`;
  }
  return text;
}

function numberAttr(node: XmlElement, name: string): number | undefined {
  const value = attr(node, name);
  if (value === undefined || !/^\d+$/u.test(value)) return undefined;
  return Number(value);
}

function conditionMatches(
  node: XmlElement,
  item: CslItem,
  state: RenderState,
): boolean {
  const match = attr(node, "match") ?? "all";
  const checks: boolean[] = [];
  const type = attr(node, "type");
  if (type !== undefined)
    checks.push(type.split(/\s+/u).includes(item.entry.type ?? ""));
  const names = attr(node, "variable");
  if (names !== undefined) {
    const present = names
      .split(/\s+/u)
      .filter((name) => name.length > 0)
      .map(
        (name) =>
          variable(item, name) !== "" ||
          (name === "author" && item.entry.authors.length > 0),
      );
    checks.push(
      match === "any" ? present.some(Boolean) : present.every(Boolean),
    );
  }
  const numeric = attr(node, "is-numeric");
  if (numeric !== undefined)
    checks.push(/^\d+$/u.test(variable(item, numeric)));
  const position = attr(node, "position");
  if (position !== undefined) {
    if (position.includes("ibid"))
      pushLoss(
        state.losses,
        "csl-position-ibid",
        "CSL ibid positions are not applied. The else branch is used.",
      );
    checks.push(false);
  }
  if (checks.length === 0) return false;
  return match === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

function renderNodes(
  nodes: readonly XmlNode[],
  item: CslItem,
  state: RenderState,
): string {
  return nodes.map((node) => renderNode(node, item, state)).join("");
}

function decorate(value: string, node: XmlElement): string {
  if (value.length === 0) return "";
  const quotes = attr(node, "quotes") === "true" ? `"${value}"` : value;
  return `${attr(node, "prefix") ?? ""}${quotes}${attr(node, "suffix") ?? ""}`;
}

function renderNode(node: XmlNode, item: CslItem, state: RenderState): string {
  if (node.type === "text") return node.value;
  if (node.name === "names")
    return decorate(formatNames(node, item, state), node);
  if (node.name === "date") {
    const part = elements(node, "date-part").find(
      (child) => attr(child, "name") === "year",
    );
    const year = part
      ? `${yearOf(item.entry)}${item.yearSuffix}`
      : variable(item, "issued");
    return decorate(year, node);
  }
  if (node.name === "group") {
    const rendered = node.children
      .map((child) => renderNode(child, item, state))
      .filter((value) => value.length > 0);
    if (rendered.length === 0) return "";
    return decorate(rendered.join(attr(node, "delimiter") ?? ""), node);
  }
  if (node.name === "choose") {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.name === "if" || child.name === "else-if") {
        if (conditionMatches(child, item, state))
          return renderNodes(child.children, item, state);
      } else if (child.name === "else")
        return renderNodes(child.children, item, state);
    }
    return "";
  }
  if (node.name === "text") {
    const macro = attr(node, "macro");
    if (macro !== undefined) {
      const body = state.macros.get(macro);
      if (body === undefined) return "";
      state.depth += 1;
      if (state.depth > 20) {
        pushLoss(
          state.losses,
          "csl-macro-depth",
          "A CSL macro expanded more than 20 times.",
        );
        return "";
      }
      const value = renderNodes(body, item, state);
      state.depth -= 1;
      return decorate(value, node);
    }
    const name = attr(node, "variable");
    if (name === "locator") state.locatorUsed = true;
    if (name === "author")
      return decorate(formatNames(node, item, state), node);
    return decorate(name === undefined ? "" : variable(item, name), node);
  }
  if (
    node.name === "label" ||
    node.name === "number" ||
    node.name === "substitute"
  ) {
    pushLoss(
      state.losses,
      "unsupported-csl",
      `CSL element ${node.name} is not rendered. Supported elements are layout, text, names, name, et-al, date, date-part, group, choose, if, else-if, else, macro, and sort.`,
    );
    return node.name === "number"
      ? decorate(variable(item, attr(node, "variable") ?? ""), node)
      : "";
  }
  if (
    node.name === "name" ||
    node.name === "et-al" ||
    node.name === "date-part" ||
    node.name === "key" ||
    node.name === "sort" ||
    node.name === "layout" ||
    node.name === "if" ||
    node.name === "else-if" ||
    node.name === "else"
  )
    return "";
  pushLoss(
    state.losses,
    "unsupported-csl",
    `CSL element ${node.name} is not rendered. Supported elements are layout, text, names, name, et-al, date, date-part, group, choose, if, else-if, else, macro, and sort.`,
  );
  return renderNodes(node.children, item, state);
}

function layoutOf(section: XmlElement | undefined): XmlElement | undefined {
  return section ? elements(section, "layout")[0] : undefined;
}

function sortItems(
  items: CslItem[],
  section: XmlElement | undefined,
): CslItem[] {
  const keys = section ? descendants(section, "key") : [];
  if (keys.length === 0) return items;
  return [...items].sort((left, right) => {
    for (const key of keys) {
      const name = attr(key, "variable") ?? "";
      const a =
        name === "author"
          ? family(left.entry.authors[0] ?? "")
          : variable(left, name);
      const b =
        name === "author"
          ? family(right.entry.authors[0] ?? "")
          : variable(right, name);
      const order = a.localeCompare(b);
      if (order !== 0) return order;
    }
    return 0;
  });
}

function renderLayout(
  layout: XmlElement,
  item: CslItem,
  state: RenderState,
): string {
  const body = renderNodes(layout.children, item, state);
  return `${attr(layout, "prefix") ?? ""}${body}${attr(layout, "suffix") ?? ""}`;
}

export interface FormattedResearch {
  readonly form: CitationForm;
  readonly citations: readonly string[];
  readonly bibliography: readonly {
    readonly id: string;
    readonly label: string;
    readonly text: string;
  }[];
  readonly unresolved: readonly string[];
  readonly losses: readonly ResearchLoss[];
}

export function formatCitations(
  entries: readonly CitationEntry[],
  clusters: readonly CitationCluster[],
  style: XmlElement,
): FormattedResearch {
  const losses: ResearchLoss[] = [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const form = citationForm(style);
  const numbers = new Map<string, number>();
  let next = 1;
  const unresolved: string[] = [];
  for (const cluster of clusters) {
    for (const item of cluster.items) {
      if (!byId.has(item.id)) {
        if (!unresolved.includes(item.id)) unresolved.push(item.id);
        continue;
      }
      if (!numbers.has(item.id)) numbers.set(item.id, next++);
    }
  }
  const suffixes = new Map<string, string>();
  if (form !== "numeric") {
    const groups = new Map<string, string[]>();
    for (const entry of entries) {
      if (!numbers.has(entry.id)) continue;
      const key = `${family(entry.authors[0] ?? "")} ${yearOf(entry)}`;
      const group = groups.get(key) ?? [];
      group.push(entry.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((left, right) => left.localeCompare(right));
      group.forEach((id, index) => {
        suffixes.set(id, String.fromCharCode(97 + index));
      });
    }
  }
  const macros = new Map<string, readonly XmlNode[]>();
  for (const macro of elements(style, "macro")) {
    const name = attr(macro, "name");
    if (name) macros.set(name, macro.children);
  }
  const citation = elements(style, "citation")[0];
  const bibliography = elements(style, "bibliography")[0];
  const citationLayout = layoutOf(citation);
  const bibliographyLayout = layoutOf(bibliography);
  const itemFor = (
    ref: CitationCluster["items"][number],
  ): CslItem | undefined => {
    const entry = byId.get(ref.id);
    if (!entry) return undefined;
    return {
      entry,
      number: numbers.get(ref.id) ?? 0,
      suppressAuthor: ref.suppressAuthor === true,
      yearSuffix: suffixes.get(ref.id) ?? "",
      ...(ref.locator === undefined ? {} : { locator: ref.locator }),
      ...(ref.label === undefined ? {} : { label: ref.label }),
    };
  };
  const stateFor = (
    mode: "citation" | "bibliography",
    section: XmlElement | undefined,
  ): RenderState => {
    const source = section ?? style;
    const base = {
      macros,
      form,
      losses,
      mode,
      etAlUseFirst: numberAttr(source, "et-al-use-first") ?? 1,
      depth: 0,
      locatorUsed: false,
    };
    const etAlMin = numberAttr(source, "et-al-min");
    return etAlMin === undefined ? base : { ...base, etAlMin };
  };
  const citations = clusters.map((cluster) => {
    const state = stateFor("citation", citation);
    const items = cluster.items.flatMap((ref) => {
      const item = itemFor(ref);
      return item === undefined ? [] : [item];
    });
    const missing = cluster.items
      .filter((ref) => !byId.has(ref.id))
      .map((ref) => ref.id);
    const collapse =
      citation !== undefined &&
      attr(citation, "collapse") === "citation-number" &&
      citationLayout !== undefined &&
      citationLayout.children.every(
        (child) =>
          child.type === "element" &&
          child.name === "text" &&
          attr(child, "variable") === "citation-number",
      ) &&
      items.every((item) => item.locator === undefined);
    let body = "";
    if (items.length > 0) {
      if (citationLayout === undefined)
        body = items.map((item) => String(item.number)).join(", ");
      else if (collapse) {
        const ordered = [...items].sort(
          (left, right) => left.number - right.number,
        );
        const ranges: string[] = [];
        let start = ordered[0]?.number;
        let previous = start;
        const flush = () => {
          if (start === undefined || previous === undefined) return;
          ranges.push(
            start === previous
              ? String(start)
              : `${String(start)}-${String(previous)}`,
          );
        };
        for (const item of ordered.slice(1)) {
          if (previous !== undefined && item.number === previous + 1)
            previous = item.number;
          else {
            flush();
            start = item.number;
            previous = item.number;
          }
        }
        flush();
        body = `${attr(citationLayout, "prefix") ?? ""}${ranges.join(attr(citationLayout, "delimiter") ?? ", ")}${attr(citationLayout, "suffix") ?? ""}`;
      } else {
        const layout = citationLayout;
        const ordered = sortItems(items, citation);
        body = `${attr(layout, "prefix") ?? ""}${ordered
          .map((item) => {
            const rendered = renderNodes(layout.children, item, state);
            if (!state.locatorUsed && item.locator !== undefined)
              return `${rendered}, ${item.label ?? "p."} ${item.locator}`;
            return rendered;
          })
          .join(
            attr(layout, "delimiter") ?? "",
          )}${attr(layout, "suffix") ?? ""}`;
      }
    }
    if (missing.length > 0)
      body = `${body}${body.length > 0 ? " " : ""}[${missing.join(", ")}]`;
    return `${cluster.prefix ?? ""}${body}${cluster.suffix ?? ""}`;
  });
  const cited = entries.filter((entry) => numbers.has(entry.id));
  const bibliographyItems = sortItems(
    cited.map((entry) => ({
      entry,
      number: numbers.get(entry.id) ?? 0,
      suppressAuthor: false,
      yearSuffix: suffixes.get(entry.id) ?? "",
    })),
    bibliography,
  );
  const renderedBibliography = bibliographyItems.map((item) => {
    const state = stateFor("bibliography", bibliography);
    const text = bibliographyLayout
      ? renderLayout(bibliographyLayout, item, state)
      : `${String(item.number)}. ${item.entry.title ?? item.entry.id}`;
    const label =
      form === "numeric"
        ? String(item.number)
        : formatNames(
            {
              type: "element",
              name: "names",
              attributes: {},
              children: [
                {
                  type: "element",
                  name: "name",
                  attributes: { form: "short", and: "symbol" },
                  children: [],
                },
              ],
            },
            item,
            state,
          ) +
          (yearOf(item.entry)
            ? `, ${yearOf(item.entry)}${item.yearSuffix}`
            : "");
    return { id: item.entry.id, label, text };
  });
  for (const id of unresolved)
    pushLoss(
      losses,
      "unresolved-citation",
      `Citation ${id} has no bibliography entry. The reference stays in the source.`,
    );
  return {
    form,
    citations,
    bibliography: renderedBibliography,
    unresolved,
    losses,
  };
}
