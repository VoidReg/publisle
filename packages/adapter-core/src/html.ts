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
    return `<section data-publisle-island="${escapeAttribute(node.blockId)}" aria-label="${escapeAttribute(node.label)}"><div data-publisle-fallback>${serializeNodes(content)}</div><div data-publisle-mount hidden></div>${button ? serializeNode(button) : ""}</section>`;
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

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern =
    /([^\s=/><]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!name) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, value);
  }
  return attributes;
}

function writeAttributes(attributes: ReadonlyMap<string, string>): string {
  let result = "";
  for (const [name, value] of attributes) {
    result += ` ${name}="${escapeAttribute(value)}"`;
  }
  return result;
}

/** Assign placement ids from recorded attributes. This walks tags, not document text. */
export function instantiateHtml(html: string, instanceId: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(instanceId))
    throw new Error("Placement ID must be a bounded safe host identifier.");
  const generated = new Set<string>();
  for (let offset = 0; offset < html.length;) {
    const start = html.indexOf("<", offset);
    if (start < 0) break;
    const end = tagEnd(html, start);
    const tag = html.slice(start, end + 1);
    const id = /\bdata-publisle-id="([^"]*)"/u.exec(tag)?.[1];
    if (id !== undefined) generated.add(id);
    offset = end + 1;
  }
  let result = "";
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start === -1) {
      result += html.slice(index);
      break;
    }
    result += html.slice(index, start);
    const end = tagEnd(html, start);
    const tag = html.slice(start, end + 1);
    result += rewriteTag(tag, instanceId, generated);
    index = end + 1;
  }
  return result;
}

function tagEnd(html: string, start: number): number {
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
  const nameEnd = tag.search(/[\s/>]/u);
  const tagName = tag.slice(1, nameEnd === -1 ? undefined : nameEnd);
  const attributeSource = tag.slice(
    tagName.length + 1,
    tag.endsWith("/>") ? -2 : -1,
  );
  const attributes = readAttributes(attributeSource);
  const localId = attributes.get("data-publisle-id");
  if (localId !== undefined) attributes.set("id", `${instanceId}-${localId}`);
  const localRef = attributes.get("data-publisle-ref");
  if (localRef !== undefined)
    attributes.set("href", `#${instanceId}-${localRef}`);
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
    if (value !== undefined)
      attributes.set(
        name,
        value
          .split(/\s+/u)
          .map((id) => (generated.has(id) ? `${instanceId}-${id}` : id))
          .join(" "),
      );
  }
  for (const name of ["href", "xlink:href"]) {
    const value = attributes.get(name);
    if (value?.startsWith("#") && generated.has(value.slice(1)))
      attributes.set(name, `#${instanceId}-${value.slice(1)}`);
  }
  const closing = tag.endsWith("/>") ? " />" : ">";
  return `<${tagName}${writeAttributes(attributes)}${closing}`;
}
