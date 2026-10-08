import { sha256Hex } from "./hash.ts";

import type {
  BlockRegistry,
  PortableBlockDefinition,
  RegistryOptions,
} from "./types.ts";

export function createRegistry(
  definitions: readonly PortableBlockDefinition<
    `${string}:${string}`,
    unknown,
    number
  >[],
  options: RegistryOptions = {},
): BlockRegistry {
  const preparationVersion = options.preparationVersion ?? "1";
  if (typeof preparationVersion !== "string" || !preparationVersion.trim())
    throw new Error("Registry preparationVersion must be a nonempty string.");
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
    JSON.stringify([
      preparationVersion,
      [...entries.values()]
        .map(({ type, schemaVersion }) => [type, schemaVersion])
        .sort(([left], [right]) =>
          String(left) < String(right)
            ? -1
            : String(left) > String(right)
              ? 1
              : 0,
        ),
    ]),
  );

  return {
    definitions: entries,
    version,
    get(type) {
      return entries.get(type);
    },
  };
}
