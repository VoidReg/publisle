import { isPlainObject } from "./object.ts";

export type JsonPrimitive = boolean | number | string | null;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonObject | JsonPrimitive | readonly JsonValue[];

export type JsonCompatible<T> = T extends JsonPrimitive
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends bigint | symbol | undefined
      ? never
      : T extends readonly (infer Item)[]
        ? { readonly [K in keyof T]: JsonCompatible<Item> }
        : { [K in keyof T]: JsonCompatible<T[K]> };

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}
