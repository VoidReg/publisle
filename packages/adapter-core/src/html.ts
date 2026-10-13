import type { RenderNode } from "./types.ts";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function serializeAttributes(
  attributes: Readonly<Record<string, boolean | number | string>>,
): string {
  let result = "";
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === undefined) continue;
    if (value === true) {
      result += ` ${name}`;
      continue;
    }
    result += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  return result;
}

function isActivateButton(node: RenderNode): boolean {
  return (
    node.kind === "element" &&
    node.tag === "button" &&
    node.attributes["data-publisle-activate"] !== undefined
  );
}

export function serializeNodes(nodes: readonly RenderNode[]): string {
  return nodes.map(serializeNode).join("");
}

function serializeNode(node: RenderNode): string {
  if (node.kind === "text") return escapeText(node.value);
  if (node.kind === "raw")
    return node.value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
  if (node.kind === "component") {
    if (!node.artifact?.length)
      throw new Error(
        "Cannot serialize a framework component without static lowering or authored fallback.",
      );
    return serializeNodes(node.artifact);
  }
  if (node.kind === "island") {
    const content = node.fallback.filter((child) => !isActivateButton(child));
    const button = node.fallback.find(isActivateButton);
    const provenance = node.provenance
      ? ` data-publisle-contract="${escapeAttribute(node.provenance)}"`
      : "";
    return `<section data-publisle-island="${escapeAttribute(node.blockId)}" aria-label="${escapeAttribute(node.label)}"${provenance}><div data-publisle-fallback>${serializeNodes(content)}</div><div data-publisle-mount hidden></div>${button ? serializeNode(button) : ""}</section>`;
  }
  if (node.tag === "script") return "";
  const attributes = publicationAttributes(node.attributes);
  const attrs = serializeAttributes(attributes);
  if (VOID_ELEMENTS.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${serializeNodes(node.children)}</${node.tag}>`;
}

function publicationAttributes(
  attributes: Readonly<Record<string, boolean | number | string>>,
): Record<string, boolean | number | string> {
  const result: Record<string, boolean | number | string> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "id" && typeof value === "string") {
      result["data-publisle-id"] = value;
      continue;
    }
    if (name === "href" && typeof value === "string" && value.startsWith("#")) {
      result["data-publisle-ref"] ??= value.slice(1);
      continue;
    }
    result[name] = value;
  }
  return result;
}

interface AttributeToken {
  readonly name: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

// Only changed placement references are decoded. These are emitted by our
// serializer, which uses the five XML entities; numeric references are supported
// as well. All unrelated authored HTML remains byte-for-byte unchanged.
function decodeReference(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);/giu,
    (source, entity: string) => {
      if (!entity.startsWith("#"))
        return entities[entity.toLowerCase()] ?? source;
      const point =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "\uFFFD";
    },
  );
}

function readAttributes(tag: string): AttributeToken[] {
  if (!/^<[A-Za-z]/u.test(tag)) return [];
  const nameEnd = tag.search(/[\s/>]/u);
  if (nameEnd < 0) return [];
  const tokens: AttributeToken[] = [];
  const pattern =
    /([^\s=/><]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  const source = tag.slice(nameEnd, tag.endsWith("/>") ? -2 : -1);
  for (const match of source.matchAll(pattern)) {
    tokens.push({
      name: (match[1] ?? "").toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? "",
      start: nameEnd + match.index,
      end: nameEnd + match.index + match[0].length,
    });
  }
  return tokens;
}

/** Assign placement ids from recorded attributes. This walks tags, not document text. */
export function instantiateHtml(html: string, instanceId: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(instanceId))
    throw new Error("Placement ID must be a bounded safe host identifier.");
  const generated = new Set<string>();
  for (const { tag } of htmlTags(html)) {
    const rawId = readAttributes(tag).find(
      (token) => token.name === "data-publisle-id",
    )?.value;
    if (rawId !== undefined) generated.add(decodeReference(rawId));
  }
  let result = "";
  let offset = 0;
  for (const { start, end, tag } of htmlTags(html)) {
    result +=
      html.slice(offset, start) + rewriteTag(tag, instanceId, generated);
    offset = end + 1;
  }
  return result + html.slice(offset);
}

function* htmlTags(
  html: string,
): Generator<{ start: number; end: number; tag: string }> {
  let offset = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start < 0) return;
    const end = tagEnd(html, start);
    const tag = html.slice(start, end + 1);
    yield { start, end, tag };
    offset = end + 1;
    const raw = /^<(script|style|textarea|title)(?:\s|>)/iu.exec(tag)?.[1];
    if (raw) {
      const closing = new RegExp(`</${raw}\\s*>`, "giu");
      closing.lastIndex = offset;
      const match = closing.exec(html);
      if (!match) return;
      offset = match.index;
    }
  }
}

function tagEnd(html: string, start: number): number {
  if (html.startsWith("<![CDATA[", start)) {
    const end = html.indexOf("]]>", start + 9);
    return end < 0 ? html.length - 1 : end + 2;
  }
  if (html.startsWith("<!--", start)) {
    const end = html.indexOf("-->", start + 4);
    return end < 0 ? html.length - 1 : end + 2;
  }
  let quote = "";
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index] ?? "";
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return html.length - 1;
}

function rewriteTag(
  tag: string,
  instanceId: string,
  generated: ReadonlySet<string>,
): string {
  if (!tag.startsWith("<") || tag.startsWith("</") || tag.startsWith("<!"))
    return tag;
  const tokens = readAttributes(tag);
  const attributes = new Map(
    tokens.map((token) => [token.name, decodeReference(token.value)]),
  );
  const changes = new Map<string, string>();
  const localId = attributes.get("data-publisle-id");
  if (localId !== undefined) changes.set("id", `${instanceId}-${localId}`);
  const localRef = attributes.get("data-publisle-ref");
  if (localRef !== undefined) changes.set("href", `#${instanceId}-${localRef}`);
  for (const name of [
    "aria-labelledby",
    "aria-describedby",
    "aria-controls",
    "aria-owns",
    "aria-flowto",
    "aria-activedescendant",
    "aria-details",
    "aria-errormessage",
    "for",
    "headers",
    "list",
    "form",
  ]) {
    const value = attributes.get(name);
    if (value !== undefined) {
      const rewritten = value
        .split(/\s+/u)
        .map((id) => (generated.has(id) ? `${instanceId}-${id}` : id))
        .join(" ");
      if (rewritten !== value) changes.set(name, rewritten);
    }
  }
  for (const name of ["href", "xlink:href"]) {
    const value = attributes.get(name);
    if (
      !changes.has(name) &&
      value?.startsWith("#") &&
      generated.has(value.slice(1))
    )
      changes.set(name, `#${instanceId}-${value.slice(1)}`);
  }
  let result = "";
  let offset = 0;
  for (const token of tokens) {
    const value = changes.get(token.name);
    if (value === undefined) continue;
    result +=
      tag.slice(offset, token.start) +
      `${token.name}="${escapeAttribute(value)}"`;
    offset = token.end;
  }
  result += tag.slice(offset);
  const added = [...changes].filter(([name]) => !attributes.has(name));
  if (added.length) {
    const end = result.length - (result.endsWith("/>") ? 2 : 1);
    result =
      result.slice(0, end) +
      added
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join("") +
      result.slice(end);
  }
  return result;
}
