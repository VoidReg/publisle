import {
  canonicalizeJson,
  parseJson,
  isPlainObject,
  isBlockType,
  validateTraversal,
  type ContractSchema,
  type ContractSource,
  type JsonObject,
  type JsonValue,
  type SemanticDeclaration,
  type TraversalDeclaration,
} from "@publisle/schema";
import { digestJson } from "./canonical.ts";
import { BETA_SCHEMAS } from "./schemas.ts";
import { validateStructure } from "./validate.ts";
import { validateSemanticBindings } from "./semantics.ts";
import { isSchemaParser } from "./schema-first.ts";

const PROFILE = "urn:publisle:contract:beta";
const SCHEMA_PROFILE = "urn:publisle:schema-profile:beta";
const LIMIT = 128;

/** Structural host interface. This module has no dependency on a registry implementation. */
export interface ExportableDefinition {
  readonly type: `${string}:${string}`;
  readonly schemaVersion: number;
  readonly contract?: ContractSource;
  readonly schema: { parse(value: unknown): unknown };
  readonly traversal?: TraversalDeclaration;
  readonly semantics?: SemanticDeclaration;
  readonly defaults?: unknown;
  readonly normalize?: unknown;
  readonly resources?: unknown;
  readonly island?: unknown;
  readonly migrations?: readonly { readonly from: number }[];
}
export interface ExportableRegistry {
  readonly definitions: ReadonlyMap<string, ExportableDefinition>;
  get(type: string): ExportableDefinition | undefined;
}
export interface PortabilityReport {
  readonly structural: boolean;
  readonly descriptive: boolean;
  readonly declarative: boolean;
  readonly implementationBound: boolean;
  readonly limitations: readonly string[];
  readonly executable: Readonly<Record<string, string>>;
}
export interface ContractBody {
  readonly profile: typeof PROFILE;
  readonly identity: {
    readonly type: `${string}:${string}`;
    readonly schemaVersion: number;
    readonly contractFormatVersion: 1;
    readonly semanticProfile: string;
  };
  readonly source: ContractSource;
  readonly envelopeSchema: ContractSchema;
  readonly schemas: readonly ContractSchema[];
  readonly traversal: TraversalDeclaration | null;
  readonly semantics: SemanticDeclaration | null;
  readonly defaults: JsonValue | null;
  readonly portability: PortabilityReport;
  readonly dependencies: readonly string[];
}
export interface ExportedContract {
  /** The seal is outside the digest preimage: exactly `contract`, with no exclusions. */
  readonly id: string;
  readonly digest: `sha256:${string}`;
  readonly contract: ContractBody;
}
export interface ContractLock {
  readonly profile: "urn:publisle:contract-lock:beta";
  readonly roots: readonly string[];
  readonly contracts: readonly {
    readonly id: string;
    readonly digest: string;
    readonly type: string;
    readonly schemaVersion: number;
    readonly dependencies: readonly string[];
  }[];
  readonly schemas: readonly { readonly id: string; readonly digest: string }[];
}
export interface ContractBundle {
  readonly profile: "urn:publisle:contract-bundle:beta";
  readonly roots: readonly string[];
  readonly contracts: readonly ExportedContract[];
  readonly lock: ContractLock;
}

const text = { type: "string", minLength: 1 } as const;
const strings = { type: "array", maxItems: 4096, items: text } as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const dictionary = { type: "object", additionalProperties: text } as const;
const object = (
  properties: JsonObject,
  required = Object.keys(properties),
): JsonObject => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const schema = { anyOf: [{ type: "boolean" }, { type: "object" }] } as const;
const sourceSchema = object(
  {
    mode: { enum: ["schema-first", "verified-adapter"] },
    dataSchema: schema,
    schemaDependencies: { type: "array", maxItems: LIMIT, items: schema },
    documentation: object({
      name: text,
      purpose: text,
      properties: dictionary,
      validExamples: {
        type: "array",
        minItems: 1,
        maxItems: 64,
        items: object({ input: true, output: true }),
      },
      invalidExamples: {
        type: "array",
        minItems: 1,
        maxItems: 64,
        items: object({ input: true, diagnostic: text }),
      },
    }),
    behavior: object({ limitations: strings, executable: dictionary }),
    projections: object({ reading: text, semantic: text }),
    compatibility: object({
      schemaProfile: { const: SCHEMA_PROFILE },
      semanticProfile: text,
      runtimeABI: text,
    }),
    provenance: object({ publisher: text, license: text }),
    dependencies: {
      type: "array",
      maxItems: LIMIT,
      items: object({
        type: text,
        schemaVersion: { type: "integer", minimum: 1 },
      }),
    },
  },
  [
    "mode",
    "dataSchema",
    "documentation",
    "behavior",
    "projections",
    "compatibility",
    "provenance",
  ],
);

function assertShape(value: unknown, shape: ContractSchema): void {
  const result = validateStructure(value, shape);
  if (!result.valid)
    throw new Error(
      result.diagnostics
        .map((entry) => `${entry.code} ${entry.pointer}: ${entry.message}`)
        .join("; "),
    );
}
function clone<T>(value: T): T {
  return parseJson(canonicalizeJson(value)) as T;
}
function assertSchema(
  value: ContractSchema,
  dependencies: readonly ContractSchema[],
): void {
  const result = validateStructure(null, value, dependencies);
  const errors = result.diagnostics.filter(
    (entry) => entry.code !== "invalid-data",
  );
  if (errors.length)
    throw new Error(
      errors.map((entry) => `${entry.code}: ${entry.message}`).join("; "),
    );
}

/** Only schema-valued keywords are traversed; annotations/examples are never interpreted as schemas. */
function refs(
  value: ContractSchema,
  output = new Set<string>(),
  budget = { steps: 0 },
  depth = 0,
): Set<string> {
  if (++budget.steps > 4096 || depth > 64)
    throw new Error("Schema inspection budget exceeded.");
  if (typeof value === "boolean") return output;
  if (!isPlainObject(value))
    throw new Error("Schema must be an object or boolean.");
  if (typeof value["$ref"] === "string")
    output.add(value["$ref"].split("#")[0] ?? "");
  for (const key of ["$defs", "properties"]) {
    const children = value[key];
    if (isPlainObject(children))
      for (const child of Object.values(children))
        refs(child as ContractSchema, output, budget, depth + 1);
  }
  for (const key of [
    "items",
    "additionalProperties",
    "not",
    "if",
    "then",
    "else",
  ]) {
    const child = value[key];
    if (child !== undefined)
      refs(child as ContractSchema, output, budget, depth + 1);
  }
  for (const key of ["prefixItems", "allOf", "anyOf", "oneOf"]) {
    const children = value[key];
    if (Array.isArray(children))
      for (const child of children)
        refs(child as ContractSchema, output, budget, depth + 1);
  }
  return output;
}
function schemaId(value: ContractSchema): string | undefined {
  return typeof value === "object" && typeof value["$id"] === "string"
    ? value["$id"]
    : undefined;
}
/** Exact transitive resource closure. Unused supplied schemas are not exported. No fetch. */
export function collectSchemaClosure(
  roots: readonly ContractSchema[],
  available: readonly ContractSchema[],
): readonly ContractSchema[] {
  if (available.length > LIMIT)
    throw new Error("Schema dependency count exceeds 128.");
  if (roots.length > LIMIT) throw new Error("Schema root count exceeds 128.");
  roots = clone(roots);
  available = clone(available);
  const inventory = new Map<string, ContractSchema>();
  for (const entry of [...available, ...roots]) {
    const id = schemaId(entry);
    if (!id) continue;
    const old = inventory.get(id);
    if (old !== undefined && canonicalizeJson(old) !== canonicalizeJson(entry))
      throw new Error(`Conflicting schema resource: ${id}`);
    inventory.set(id, entry);
  }
  const used = new Map<string, ContractSchema>();
  const visit = (entry: ContractSchema) => {
    for (const id of refs(entry)) {
      if (!id || id === schemaId(entry) || used.has(id)) continue;
      const dependency = inventory.get(id);
      if (dependency === undefined)
        throw new Error(`Missing offline schema resource: ${id}`);
      used.set(id, dependency);
      if (used.size > LIMIT) throw new Error("Schema closure exceeds 128.");
      visit(dependency);
    }
  };
  for (const root of roots) visit(root);
  for (const root of roots) {
    const id = schemaId(root);
    if (id) used.delete(id);
  }
  return [...used.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, entry]) => entry);
}

/** Does not run parser/hook code or enumerate a renderer-bearing definition. */
export function inspectPortability(
  definition: ExportableDefinition,
): PortabilityReport {
  const source = definition.contract;
  if (source) {
    assertShape(source, sourceSchema);
    assertSchema(
      source.dataSchema,
      collectSchemaClosure(
        [source.dataSchema],
        source.schemaDependencies ?? [],
      ),
    );
  }
  const executable: Record<string, string> = { ...source?.behavior.executable };
  if (
    source?.mode !== "schema-first" ||
    !isSchemaParser(
      definition.schema,
      source.dataSchema,
      source.schemaDependencies ?? [],
    )
  )
    executable["parse"] ??=
      "Trusted authoring parser; fixture parity is not a proof of equivalence for all inputs.";
  for (const name of ["normalize", "resources", "island"] as const) {
    if (definition[name] !== undefined)
      executable[name] ??= `Host ${name} callback is not portable JSON.`;
  }
  for (const migration of definition.migrations ?? [])
    executable[`migration:${String(migration.from)}`] ??=
      "Explicit host conversion; source must be retained.";
  return {
    structural: source !== undefined,
    descriptive: source !== undefined,
    declarative:
      definition.traversal !== undefined || definition.semantics !== undefined,
    implementationBound: Object.keys(executable).length > 0,
    limitations: source?.behavior.limitations ?? [
      "No complete exportable schema or documentation was provided.",
    ],
    executable,
  };
}

function verifyAdapter(
  definition: ExportableDefinition,
  source: ContractSource,
  schemas: readonly ContractSchema[],
): void {
  for (const example of source.documentation.validExamples) {
    const actual: unknown = definition.schema.parse(clone(example.input));
    if (canonicalizeJson(actual) !== canonicalizeJson(example.output))
      throw new Error(
        `Parser output differs from declared example for ${definition.type}.`,
      );
    const result = definition.semantics
      ? validateSemanticBindings(
          definition.semantics,
          actual,
          source.dataSchema,
          schemas,
        )
      : validateStructure(actual, source.dataSchema, schemas);
    if (!result.valid)
      throw new Error(
        `Parser output violates exported contract for ${definition.type}: ${canonicalizeJson(result.diagnostics)}`,
      );
  }
  for (const example of source.documentation.invalidExamples) {
    if (validateStructure(example.input, source.dataSchema, schemas).valid)
      throw new Error(
        "Negative example satisfies the exported structural schema.",
      );
    let error: unknown;
    try {
      definition.schema.parse(clone(example.input));
    } catch (caught) {
      error = caught;
    }
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== example.diagnostic
    )
      throw new Error(
        `Parser rejection differs from declared diagnostic for ${definition.type}.`,
      );
  }
}

async function seal(contract: ContractBody): Promise<ExportedContract> {
  const digest = await digestJson(contract);
  return { id: `urn:publisle:contract:${digest}`, digest, contract };
}

async function exportOne(
  definition: ExportableDefinition,
  dependencies: readonly string[],
): Promise<ExportedContract> {
  if (
    !isBlockType(definition.type) ||
    !Number.isInteger(definition.schemaVersion) ||
    definition.schemaVersion < 1
  )
    throw new Error("Invalid block identity.");
  if (!definition.contract)
    throw new Error(
      `Definition ${definition.type} has no exportable contract; callbacks cannot be reverse-engineered.`,
    );
  const source = clone(definition.contract);
  assertShape(source, sourceSchema);
  if (
    source.mode === "schema-first" &&
    !isSchemaParser(
      definition.schema,
      source.dataSchema,
      source.schemaDependencies ?? [],
    )
  )
    throw new Error(
      "Schema-first mode requires the generated structural parser, not an opaque callback.",
    );
  if (definition.traversal) validateTraversal(definition.traversal);
  const envelopeSchema = blockEnvelope(
    definition.type,
    definition.schemaVersion,
  );
  const dataResource = wrapData(source.dataSchema);
  const schemas = collectSchemaClosure(
    [envelopeSchema],
    [
      dataResource,
      ...(schemaId(source.dataSchema) ? [source.dataSchema] : []),
      BETA_SCHEMAS["block-envelope"],
      BETA_SCHEMAS["json-value"],
      BETA_SCHEMAS.readable,
      BETA_SCHEMAS.explanation,
      BETA_SCHEMAS["rich-content"],
      ...(source.schemaDependencies ?? []),
    ],
  );
  assertSchema(envelopeSchema, schemas);
  const dataDependencies = collectSchemaClosure(
    [source.dataSchema],
    source.schemaDependencies ?? [],
  );
  assertSchema(source.dataSchema, dataDependencies);
  verifyAdapter(definition, source, dataDependencies);
  // Do not retain unused supplied schemas in the sealed source either.
  const canonicalSource: ContractSource = {
    ...source,
    schemaDependencies: dataDependencies,
  };
  return seal(
    clone({
      profile: PROFILE,
      identity: {
        type: definition.type,
        schemaVersion: definition.schemaVersion,
        contractFormatVersion: 1,
        semanticProfile: source.compatibility.semanticProfile,
      },
      source: canonicalSource,
      envelopeSchema,
      schemas,
      traversal: definition.traversal ?? null,
      semantics: definition.semantics ?? null,
      defaults:
        definition.defaults === undefined
          ? null
          : (clone(definition.defaults) as JsonValue),
      portability: inspectPortability(definition),
      dependencies,
    }),
  );
}

function blockEnvelope(type: string, schemaVersion: number): ContractSchema {
  return {
    allOf: [
      { $ref: "urn:publisle:schema:block-envelope" },
      {
        type: "object",
        properties: {
          type: { const: type },
          schemaVersion: { const: schemaVersion },
          data: { $ref: "urn:publisle:contract-data" },
        },
      },
    ],
  };
}
function wrapData(dataSchema: ContractSchema): ContractSchema {
  // Wrap, rather than changing the authored root's ID or relative reference scope.
  return typeof dataSchema === "boolean"
    ? { $id: "urn:publisle:contract-data", allOf: [dataSchema] }
    : schemaId(dataSchema)
      ? {
          $id: "urn:publisle:contract-data",
          $ref: schemaId(dataSchema) ?? "",
        }
      : { ...dataSchema, $id: "urn:publisle:contract-data" };
}

/** Export a dependency-free individual definition; dependencies require a registry closure. */
export async function exportBlockContract(
  definition: ExportableDefinition,
): Promise<ExportedContract> {
  if (definition.contract?.dependencies?.length)
    throw new Error(
      "Use registry export to resolve block contract dependencies.",
    );
  return validateBlockContract(await exportOne(definition, []));
}

async function exportSelected(
  registry: ExportableRegistry,
  selected: readonly {
    readonly type: string;
    readonly schemaVersion: number;
  }[],
): Promise<ContractBundle> {
  const contracts = new Map<string, ExportedContract>();
  const visiting = new Set<string>();
  const visit = async (
    type: string,
    version: number,
  ): Promise<ExportedContract> => {
    const existing = contracts.get(type);
    if (existing) {
      if (existing.contract.identity.schemaVersion !== version)
        throw new Error(`Conflicting payload versions: ${type}`);
      return existing;
    }
    if (visiting.has(type))
      throw new Error(`Cyclic block contract dependencies: ${type}`);
    if (contracts.size + visiting.size >= LIMIT)
      throw new Error("Contract closure exceeds 128.");
    const definition = registry.get(type);
    if (definition?.schemaVersion !== version)
      throw new Error(
        `Missing exact definition ${type}@${String(version)}; export does not migrate source.`,
      );
    visiting.add(type);
    const dependencies: string[] = [];
    for (const entry of definition.contract?.dependencies ?? [])
      dependencies.push((await visit(entry.type, entry.schemaVersion)).id);
    const contract = await exportOne(
      definition,
      [...new Set(dependencies)].sort(),
    );
    visiting.delete(type);
    contracts.set(type, contract);
    return contract;
  };
  const roots = new Set<string>();
  for (const entry of selected)
    roots.add((await visit(entry.type, entry.schemaVersion)).id);
  return createContractBundle([...contracts.values()], [...roots]);
}
export function exportRegistryContracts(
  registry: ExportableRegistry,
): Promise<ContractBundle> {
  return exportSelected(
    registry,
    [...registry.definitions.values()].map(({ type, schemaVersion }) => ({
      type,
      schemaVersion,
    })),
  );
}
export function exportDocumentContracts(
  document: {
    readonly blocks: readonly {
      readonly type: string;
      readonly schemaVersion: number;
    }[];
  },
  registry: ExportableRegistry,
): Promise<ContractBundle> {
  return exportSelected(registry, document.blocks);
}

/** JSON-only inspection. No registry code, dynamic imports, network, or parser execution. */
export async function validateBlockContract(
  input: unknown,
): Promise<ExportedContract> {
  const value = clone(input);
  assertShape(
    value,
    object({
      id: text,
      digest: text,
      contract: object({
        profile: { const: PROFILE },
        identity: object({
          type: text,
          schemaVersion: { type: "integer", minimum: 1 },
          contractFormatVersion: { const: 1 },
          semanticProfile: text,
        }),
        source: sourceSchema,
        envelopeSchema: schema,
        schemas: { type: "array", maxItems: LIMIT, items: schema },
        traversal: { anyOf: [{ type: "null" }, { type: "object" }] },
        semantics: { anyOf: [{ type: "null" }, { type: "object" }] },
        defaults: true,
        portability: object({
          structural: { type: "boolean" },
          descriptive: { type: "boolean" },
          declarative: { type: "boolean" },
          implementationBound: { type: "boolean" },
          limitations: strings,
          executable: dictionary,
        }),
        dependencies: strings,
      }),
    }),
  );
  const result = value as ExportedContract;
  const body = result.contract;
  if (
    result.digest !== (await digestJson(body)) ||
    result.id !== `urn:publisle:contract:${result.digest}`
  )
    throw new Error("Contract integrity mismatch.");
  if (
    !isBlockType(body.identity.type) ||
    body.identity.semanticProfile !== body.source.compatibility.semanticProfile
  )
    throw new Error("Contract identity mismatch.");
  if (body.traversal) validateTraversal(body.traversal);
  if (
    canonicalizeJson(body.envelopeSchema) !==
    canonicalizeJson(
      blockEnvelope(body.identity.type, body.identity.schemaVersion),
    )
  )
    throw new Error(
      "Envelope schema does not enforce the exact declared identity and data binding.",
    );
  const dataResource = body.schemas.find(
    (entry) => schemaId(entry) === "urn:publisle:contract-data",
  );
  if (
    canonicalizeJson(dataResource) !==
    canonicalizeJson(wrapData(body.source.dataSchema))
  )
    throw new Error("Envelope data schema differs from the declared source.");
  assertSchema(body.envelopeSchema, body.schemas);
  const dependencies = collectSchemaClosure(
    [body.source.dataSchema],
    body.source.schemaDependencies ?? [],
  );
  if (
    canonicalizeJson(dependencies) !==
    canonicalizeJson(body.source.schemaDependencies ?? [])
  )
    throw new Error("Non-minimal schema dependency closure.");
  assertSchema(body.source.dataSchema, dependencies);
  const closure = collectSchemaClosure([body.envelopeSchema], body.schemas);
  if (canonicalizeJson(closure) !== canonicalizeJson(body.schemas))
    throw new Error("Non-minimal envelope dependency closure.");
  if (
    !body.portability.structural ||
    !body.portability.descriptive ||
    body.portability.implementationBound !==
      Object.keys(body.portability.executable).length > 0 ||
    body.portability.declarative !==
      (body.traversal !== null || body.semantics !== null)
  )
    throw new Error("Contradictory portability claims.");
  for (const [name, description] of Object.entries(
    body.source.behavior.executable,
  ))
    if (body.portability.executable[name] !== description)
      throw new Error(
        "Executable behavior was omitted from portability report.",
      );
  if (
    body.source.mode === "verified-adapter" &&
    !body.portability.executable["parse"]
  )
    throw new Error("Opaque parser is missing from portability report.");
  for (const example of body.source.documentation.validExamples) {
    if (
      body.source.mode === "schema-first" &&
      canonicalizeJson(example.input) !== canonicalizeJson(example.output)
    )
      throw new Error("Schema-first parser examples must be read-only.");
    const validation = body.semantics
      ? validateSemanticBindings(
          body.semantics,
          example.output,
          body.source.dataSchema,
          dependencies,
        )
      : validateStructure(example.output, body.source.dataSchema, dependencies);
    if (!validation.valid)
      throw new Error("Contract example violates schema or semantic bindings.");
    const sample = {
      id: "00000000-0000-4000-8000-000000000001",
      type: body.identity.type,
      schemaVersion: body.identity.schemaVersion,
      data: example.output,
    };
    if (!validateStructure(sample, body.envelopeSchema, body.schemas).valid)
      throw new Error(
        "Envelope schema does not accept the declared identity and data.",
      );
  }
  for (const example of body.source.documentation.invalidExamples)
    if (
      validateStructure(example.input, body.source.dataSchema, dependencies)
        .valid
    )
      throw new Error("Invalid example satisfies the data schema.");
  return result;
}

export async function createContractLock(
  contracts: readonly ExportedContract[],
  roots: readonly string[],
): Promise<ContractLock> {
  if (contracts.length > LIMIT)
    throw new Error("Contract closure exceeds 128.");
  const uniqueRoots = [...new Set(roots)].sort();
  if (uniqueRoots.length > LIMIT)
    throw new Error("Contract root count exceeds 128.");
  const inventory = new Map<string, ExportedContract>();
  const types = new Set<string>();
  const schemas = new Map<string, string>();
  for (const input of contracts) {
    const entry = await validateBlockContract(input);
    if (inventory.has(entry.id) || types.has(entry.contract.identity.type))
      throw new Error("Duplicate contract identity.");
    inventory.set(entry.id, entry);
    types.add(entry.contract.identity.type);
    // contract-data is intentionally scoped per contract; inventory names are owner-qualified.
    for (const schema of entry.contract.schemas) {
      const id = `${entry.id}#schema:${schemaId(schema) ?? "anonymous"}`;
      schemas.set(id, await digestJson(schema));
    }
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error("Cyclic contract dependencies.");
    if (visited.has(id)) return;
    const entry = inventory.get(id);
    if (!entry) throw new Error(`Missing offline contract: ${id}`);
    active.add(id);
    for (const dependency of entry.contract.dependencies) visit(dependency);
    const declared = entry.contract.source.dependencies ?? [];
    const actual = entry.contract.dependencies.map(
      (dependency) => inventory.get(dependency)?.contract.identity,
    );
    if (
      actual.length !== declared.length ||
      declared.some(
        (wanted) =>
          !actual.some(
            (found) =>
              found?.type === wanted.type &&
              found.schemaVersion === wanted.schemaVersion,
          ),
      )
    )
      throw new Error("Declared dependency identity mismatch.");
    active.delete(id);
    visited.add(id);
  };
  for (const root of uniqueRoots) visit(root);
  if (visited.size !== inventory.size)
    throw new Error("Offline bundle contains unused contracts.");
  return {
    profile: "urn:publisle:contract-lock:beta",
    roots: uniqueRoots,
    contracts: [...inventory.values()]
      .sort((a, b) => compare(a.id, b.id))
      .map((entry) => ({
        id: entry.id,
        digest: entry.digest,
        ...entry.contract.identity,
        dependencies: entry.contract.dependencies,
      }))
      .map(({ id, digest, type, schemaVersion, dependencies }) => ({
        id,
        digest,
        type,
        schemaVersion,
        dependencies,
      })),
    schemas: [...schemas.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([id, digest]) => ({ id, digest })),
  };
}
export async function createContractBundle(
  contracts: readonly ExportedContract[],
  roots: readonly string[],
): Promise<ContractBundle> {
  const lock = await createContractLock(contracts, roots);
  return clone({
    profile: "urn:publisle:contract-bundle:beta",
    roots: lock.roots,
    contracts: [...contracts].sort((a, b) => compare(a.id, b.id)),
    lock,
  });
}
export async function validateContractBundle(
  input: unknown,
): Promise<ContractBundle> {
  const value = clone(input);
  assertShape(
    value,
    object({
      profile: { const: "urn:publisle:contract-bundle:beta" },
      roots: strings,
      contracts: { type: "array", maxItems: LIMIT, items: { type: "object" } },
      lock: { type: "object" },
    }),
  );
  const bundle = value as ContractBundle;
  const lock = await createContractLock(bundle.contracts, bundle.roots);
  if (canonicalizeJson(bundle.roots) !== canonicalizeJson(lock.roots))
    throw new Error("Offline roots must be unique and sorted.");
  if (canonicalizeJson(lock) !== canonicalizeJson(bundle.lock))
    throw new Error("Offline contract lock mismatch.");
  return bundle;
}
