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
