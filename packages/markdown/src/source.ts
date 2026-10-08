import type { SourceLocation } from "@publisle/schema";

/** Derive offsets from original lines, not the parser's expanded interactive fences. */
export function sourceLocator(
  source: string,
  sourceName?: string,
): (node: unknown) => SourceLocation {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") offsets.push(index + 1);
  }
  return (node) => {
    const position = (
      node as { position?: { start?: { line: number; column: number } } }
    ).position?.start;
    const line = position?.line ?? 1;
    const column = position?.column ?? 1;
    return {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      line,
      column,
      offset: (offsets[line - 1] ?? 0) + column - 1,
    };
  };
}
