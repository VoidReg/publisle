import { sha256Hex } from "./hash.ts";

import type { BlockRegistry, PortableBlockDefinition } from "./types.ts";

export function createRegistry(
  definitions: readonly PortableBlockDefinition<
    `${string}:${string}`,
    unknown,
    number
  >[],
): BlockRegistry {
  const entries = new Map<
    string,
    PortableBlockDefinition<`${string}:${string}`, unknown, number>
  >();

  for (const definition of definitions) {
    if (entries.has(definition.type)) {
      throw new Error(`Duplicate block definition: ${definition.type}`);
    }
    entries.set(definition.type, definition);
  }

  const version = sha256Hex(
    JSON.stringify(
      [...entries.values()]
        .map(({ type, schemaVersion }) => [type, schemaVersion])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ),
  );

  return {
    definitions: entries,
    version,
    get(type) {
      return entries.get(type);
    },
  };
}
