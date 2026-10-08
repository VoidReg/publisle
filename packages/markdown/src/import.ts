import { directiveFromMarkdown } from "mdast-util-directive";
import { fromMarkdown as parse } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { directive } from "micromark-extension-directive";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";
import type { Diagnostic } from "@publisle/schema";
import { treeToDocument } from "./convert.ts";
import type { MarkdownImportOptions, MarkdownImportResult } from "./types.ts";
import { sourceLocator } from "./source.ts";
import { fromArchivalMarkdown } from "./archive.ts";

const interactiveSlots = new Set([
  "title",
  "description",
  "instructions",
  "purpose",
  "observations",
  "assumptions",
  "content-fallback",
  "fallback",
]);

/** Give the interactive container one more colon than its slots so equal fences nest. */
function nestInteractiveSlots(source: string): string {
  const lines = source.split("\n");
  let codeMarker = "";
  let interactiveColons = 0;
  let inSlot = false;
  return lines
    .map((line) => {
      const fence = /^(?: {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
      if (fence) {
        const marker = fence[1] ?? "";
        const info = (fence[2] ?? "").trim();
        if (!codeMarker) codeMarker = marker;
        else if (
          marker.startsWith(codeMarker[0] ?? "") &&
          marker.length >= codeMarker.length &&
          info === ""
        )
          codeMarker = "";
        return line;
      }
      if (codeMarker) return line;
      if (!interactiveColons) {
        const open = /^(:+)interactive(?:\{.*\})?\s*$/u.exec(line);
        const colons = open?.[1];
        if (!colons || colons.length < 3) return line;
        interactiveColons = colons.length;
        return `${":".repeat(colons.length + 1)}${line.slice(colons.length)}`;
      }
      if (inSlot) {
        if (/^:+\s*$/u.test(line)) inSlot = false;
        return line;
      }
      const slot = /^(:+)([A-Za-z][\w-]*)/u.exec(line);
      if (
        slot?.[1] &&
        slot[2] &&
        slot[1].length >= 3 &&
        interactiveSlots.has(slot[2])
      ) {
        inSlot = true;
        return line;
      }
      const close = /^(:+)\s*$/u.exec(line);
      const closeColons = close?.[1];
      if (closeColons && closeColons.length >= interactiveColons) {
        interactiveColons = 0;
        return ":".repeat(closeColons.length + 1);
      }
      return line;
    })
    .join("\n");
}

export function fromMarkdown(
  source: string,
  options: MarkdownImportOptions = {},
): MarkdownImportResult {
  const diagnostics: Diagnostic[] = [];
  try {
    if (source.trimStart().startsWith("::::publisle-document"))
      return {
        ...fromArchivalMarkdown(source, options.sourceName),
        diagnostics,
      };
    const tree = parse(nestInteractiveSlots(source), {
      extensions: [gfm(), directive(), frontmatter(["yaml"]), math()],
      mdastExtensions: [
        gfmFromMarkdown(),
        directiveFromMarkdown(),
        frontmatterFromMarkdown(["yaml"]),
        mathFromMarkdown(),
      ],
    });
    const result = treeToDocument(tree, source, diagnostics, options);
    return diagnostics.some(({ level }) => level === "error")
      ? { diagnostics, sourceMap: result.sourceMap }
      : { ...result, diagnostics };
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "markdown-import-failed",
      sourceLocation: sourceLocator(source, options.sourceName)({}),
      message:
        error instanceof Error ? error.message : "Markdown import failed.",
    });
    return { diagnostics };
  }
}
