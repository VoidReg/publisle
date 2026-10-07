import { SchemaParseError } from "@publisle/schema";
import type { FlowNode, InlineNode, ListItemData } from "./types.ts";

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

export function string(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be a string.`,
    );
  return value;
}

export function inlineNodes(
  value: unknown,
  label = "content",
): readonly InlineNode[] {
  if (!Array.isArray(value))
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be an array.`,
    );
  return value.map((entry, index) => {
    const node = record(entry, `${label}[${index}]`);
    const type = string(node["type"], `${label}[${index}].type`);
    if (
      type === "text" ||
      type === "inlineCode" ||
      type === "math" ||
      type === "rawHtml"
    ) {
      return { type, value: string(node["value"], `${label}[${index}].value`) };
    }
    if (type === "emphasis" || type === "strong" || type === "delete") {
      return {
        type,
        children: inlineNodes(node["children"], `${label}[${index}].children`),
      };
    }
    if (type === "link") {
      const result: InlineNode = {
        type,
        url: string(node["url"], `${label}[${index}].url`),
        children: inlineNodes(node["children"], `${label}[${index}].children`),
        ...(typeof node["title"] === "string" ? { title: node["title"] } : {}),
      };
      return result;
    }
    if (type === "image") {
      return {
        type,
        url: string(node["url"], `${label}[${index}].url`),
        alt: string(node["alt"], `${label}[${index}].alt`),
        ...(typeof node["title"] === "string" ? { title: node["title"] } : {}),
      };
    }
    if (type === "break") return { type };
    if (type === "footnoteReference")
      return {
        type,
        identifier: string(node["identifier"], `${label}[${index}].identifier`),
      };
    throw new SchemaParseError(
      "invalid-block-data",
      `Unsupported inline node ${JSON.stringify(type)}.`,
    );
  });
}

export function flowNodes(
  value: unknown,
  label = "children",
): readonly FlowNode[] {
  if (!Array.isArray(value))
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be an array.`,
    );
  return value.map((entry, index) => {
    const node = record(entry, `${label}[${index}]`);
    const type = string(node["type"], `${label}[${index}].type`);
    if (type === "paragraph")
      return {
        type,
        content: inlineNodes(node["content"], `${label}[${index}].content`),
      };
    if (type === "heading")
      return {
        type,
        level: Number(node["level"]),
        content: inlineNodes(node["content"], `${label}[${index}].content`),
      };
    if (type === "quote")
      return {
        type,
        children: flowNodes(node["children"], `${label}[${index}].children`),
      };
    if (type === "list") {
      if (!Array.isArray(node["items"]))
        throw new SchemaParseError(
          "invalid-block-data",
          `${label}[${index}].items must be an array.`,
        );
      return {
        type,
        ordered: node["ordered"] === true,
        ...(typeof node["start"] === "number" ? { start: node["start"] } : {}),
        items: listItems(node["items"], `${label}[${index}].items`),
      };
    }
    if (type === "code")
      return {
        type,
        value: string(node["value"], `${label}[${index}].value`),
        ...(typeof node["language"] === "string"
          ? { language: node["language"] }
          : {}),
        ...(typeof node["meta"] === "string" ? { meta: node["meta"] } : {}),
      };
    if (type === "divider") return { type };
    if (type === "rawHtml")
      return { type, value: string(node["value"], `${label}[${index}].value`) };
    throw new SchemaParseError(
      "invalid-block-data",
      `Unsupported flow node ${JSON.stringify(type)}.`,
    );
  });
}

export function listItems(
  value: unknown,
  label = "items",
): readonly ListItemData[] {
  if (!Array.isArray(value))
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be an array.`,
    );
  return value.map((entry, index) => {
    if (Array.isArray(entry)) {
      return { children: flowNodes(entry, `${label}[${index}]`) };
    }
    const item = record(entry, `${label}[${index}]`);
    const checked = item["checked"];
    if (checked !== undefined && typeof checked !== "boolean") {
      throw new SchemaParseError(
        "invalid-block-data",
        `${label}[${index}].checked must be a boolean.`,
      );
    }
    return {
      ...(typeof checked === "boolean" ? { checked } : {}),
      children: flowNodes(item["children"], `${label}[${index}].children`),
    };
  });
}
