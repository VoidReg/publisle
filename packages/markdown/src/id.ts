import { sha256Hex } from "@publisle/core/hash";
import { parseBlockId, type BlockId } from "@publisle/schema";

export function deterministicBlockId(
  value: unknown,
  occurrence: number,
): BlockId {
  const hex = sha256Hex(`${JSON.stringify(value)}:${occurrence}`).slice(0, 32);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  return parseBlockId(uuid);
}
