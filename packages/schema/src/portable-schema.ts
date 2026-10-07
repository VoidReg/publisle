export type PortableSchemaType =
  "string" | "number" | "boolean" | "object" | "array" | "null";

export interface PortableSchemaField {
  readonly type: PortableSchemaType;
  readonly description: string;
}

/** JSON description of a payload. It documents the contract and is not a second validator. */
export interface PortableSchema {
  readonly type: "object";
  readonly description?: string;
  readonly properties: Readonly<Record<string, PortableSchemaField>>;
  readonly required?: readonly string[];
}
