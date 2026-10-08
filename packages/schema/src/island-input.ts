import type { Block } from "./block.ts";
import type { ContractDependency } from "./dependencies.ts";
import type { JsonValue } from "./json.ts";
import type { InteractiveEnvelope } from "./prepared.ts";
import type { ReadableRepresentation } from "./readable.ts";

/** One frozen-beta ABI across native and artifact paths; services/targets remain out of band. */
export interface IslandInput extends InteractiveEnvelope<JsonValue> {
  readonly readable?: ReadableRepresentation;
  readonly inputVersion: 1;
  readonly block: {
    readonly id: string;
    readonly type: string;
    readonly schemaVersion: number;
    readonly contract?: { readonly id: string; readonly digest: string };
  };
}
export function createIslandInput(
  block: Block<`${string}:${string}`, unknown>,
  envelope: InteractiveEnvelope<JsonValue>,
  pins: readonly ContractDependency[] = [],
): IslandInput {
  const pin = pins.find(
    (entry) =>
      entry.type === block.type && entry.schemaVersion === block.schemaVersion,
  );
  return {
    ...envelope,
    ...(block.readable === undefined ? {} : { readable: block.readable }),
    inputVersion: 1,
    block: {
      id: block.id,
      type: block.type,
      schemaVersion: block.schemaVersion,
      ...(pin === undefined
        ? {}
        : { contract: { id: pin.id, digest: pin.digest } }),
    },
  };
}
