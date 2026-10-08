export { fromMarkdown } from "./import.ts";
export { toMarkdown, toReadingMarkdown } from "./export.ts";
export { deterministicBlockId } from "./id.ts";
export type * from "./types.ts";

import { fromMarkdown } from "./import.ts";
import { toMarkdown } from "./export.ts";
import type { MarkdownFormatResult, MarkdownFormatOptions } from "./types.ts";

export function formatMarkdown(
  source: string,
  options: MarkdownFormatOptions = {},
): MarkdownFormatResult {
  const imported = fromMarkdown(source, options);
  if (!imported.document) return { diagnostics: imported.diagnostics };
  const exported = toMarkdown(imported.document, options);
  return {
    ...exported,
    diagnostics: [...imported.diagnostics, ...exported.diagnostics],
    ...(imported.document.metadata === undefined
      ? {}
      : { metadata: imported.document.metadata }),
  };
}
export { toArchivalMarkdown, fromArchivalMarkdown } from "./archive.ts";
