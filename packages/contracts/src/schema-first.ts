import {
  SchemaParseError,
  parseJson,
  canonicalizeJson,
  type ContractSchema,
  type JsonValue,
  type Schema,
} from "@publisle/schema";
import { validateStructure } from "./validate.ts";

const parsers = new WeakMap<object, string>();

/** Conservative SDK type generation. Complex/ref-based schemas intentionally expose JsonValue. */
export type SchemaValue<S> = S extends false
  ? never
  : S extends
        | { readonly $ref: string }
        | { readonly allOf: readonly unknown[] }
        | { readonly anyOf: readonly unknown[] }
        | { readonly oneOf: readonly unknown[] }
    ? JsonValue
    : S extends { readonly const: infer V extends JsonValue }
      ? V
      : S extends { readonly enum: readonly (infer V extends JsonValue)[] }
        ? V
        : S extends { readonly type: "string" }
          ? string
          : S extends { readonly type: "number" | "integer" }
            ? number
            : S extends { readonly type: "boolean" }
              ? boolean
              : S extends { readonly type: "null" }
                ? null
                : S extends { readonly type: "array"; readonly items: infer I }
                  ? readonly SchemaValue<I>[]
                  : S extends {
                        readonly type: "object";
                        readonly properties: infer P extends Record<
                          string,
                          unknown
                        >;
                      }
                    ? S extends { readonly additionalProperties: false }
                      ? {
                          readonly [
                            K in keyof P as K extends RequiredKeys<S>
                              ? K
                              : never
                          ]: SchemaValue<P[K]>;
                        } & {
                          readonly [
                            K in keyof P as K extends RequiredKeys<S>
                              ? never
                              : K
                          ]?: SchemaValue<P[K]>;
                        }
                      : JsonValue
                    : JsonValue;
type RequiredKeys<S> = S extends { readonly required: readonly (infer K)[] }
  ? K
  : never;

/** Read-only structural parser. No defaults, coercions, refinements, or migrations. */
export function createSchemaParser<const S extends ContractSchema>(
  schema: S,
  dependencies: readonly ContractSchema[] = [],
): Schema<SchemaValue<S>> {
  const source = parseJson(canonicalizeJson(schema)) as S;
  const supplied = parseJson(
    canonicalizeJson(dependencies),
  ) as readonly ContractSchema[];
  const parser: Schema<SchemaValue<S>> = {
    parse(value) {
      const result = validateStructure(value, source, supplied);
      if (!result.valid)
        throw new SchemaParseError(
          result.diagnostics[0]?.code ?? "invalid-data",
          canonicalizeJson(result.diagnostics),
        );
      return parseJson(canonicalizeJson(value)) as SchemaValue<S>;
    },
  };
  parsers.set(parser, canonicalizeJson([source, supplied]));
  return Object.freeze(parser);
}
export function isSchemaParser(
  parser: object,
  schema: ContractSchema,
  dependencies: readonly ContractSchema[],
): boolean {
  return parsers.get(parser) === canonicalizeJson([schema, dependencies]);
}
