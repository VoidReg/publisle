import type { JsonObject, JsonValue } from "./json.ts";

/** Complete validator schema, unlike the lightweight PortableSchema descriptor. */
export type ContractSchema = boolean | JsonObject;

export interface ContractExample {
  readonly input: JsonValue;
  /** Canonical parser output, including explicitly author-declared normalization. */
  readonly output: JsonValue;
}

/** Data only. Executable hooks belong to the host definition, never this source. */
export interface ContractSource {
  readonly mode: "schema-first" | "verified-adapter";
  readonly dataSchema: ContractSchema;
  readonly schemaDependencies?: readonly ContractSchema[];
  readonly documentation: {
    readonly name: string;
    readonly purpose: string;
    readonly properties: Readonly<Record<string, string>>;
    readonly validExamples: readonly ContractExample[];
    readonly invalidExamples: readonly {
      readonly input: JsonValue;
      readonly diagnostic: string;
    }[];
  };
  readonly behavior: {
    readonly limitations: readonly string[];
    readonly executable: Readonly<Record<string, string>>;
  };
  readonly projections: {
    readonly reading: string;
    readonly semantic: string;
  };
  readonly compatibility: {
    readonly schemaProfile: string;
    readonly semanticProfile: string;
    readonly runtimeABI: string;
  };
  readonly provenance: {
    readonly publisher: string;
    readonly license: string;
  };
  readonly dependencies?: readonly {
    readonly type: `${string}:${string}`;
    readonly schemaVersion: number;
  }[];
}
