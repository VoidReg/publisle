import type { Block } from "./block.ts";
import type { BlockId } from "./block-id.ts";
import type { BlockType } from "./block-type.ts";
import type { Document } from "./document.ts";
import { SchemaParseError } from "./error.ts";
import { isJsonValue, type JsonValue } from "./json.ts";
import type { PublicationMetadata } from "./metadata.ts";
import { isPlainObject } from "./object.ts";

export type Activation = "load" | "visible" | "idle" | "interaction";

const activations = new Set<Activation>([
  "load",
  "visible",
  "idle",
  "interaction",
]);

export interface InteractiveContent {
  readonly title?: readonly JsonValue[];
  readonly description?: readonly JsonValue[];
  readonly instructions?: readonly JsonValue[];
  readonly purpose?: readonly JsonValue[];
  readonly observations?: readonly JsonValue[];
  readonly assumptions?: readonly JsonValue[];
  readonly fallback?: readonly JsonValue[];
  readonly presets?: readonly {
    readonly id: string;
    readonly binding?: string;
    readonly description?: readonly JsonValue[];
  }[];
}

export interface InteractiveAccessibility {
  readonly label?: string;
}

export interface InteractiveEnvelope<Payload> {
  readonly initialState?: JsonValue;
  readonly activation: Activation;
  readonly content?: InteractiveContent;
  readonly fallback?: readonly JsonValue[];
  readonly accessibility?: InteractiveAccessibility;
  readonly payload: Payload;
}

export interface InteractiveContentParsers {
  readonly parseTitle: (value: unknown) => readonly JsonValue[];
  readonly parseFlow: (value: unknown) => readonly JsonValue[];
}

const envelopeKeys = new Set([
  "initialState",
  "activation",
  "content",
  "fallback",
  "accessibility",
  "payload",
]);
const contentKeys = new Set([
  "title",
  "description",
  "instructions",
  "purpose",
  "observations",
  "assumptions",
  "fallback",
  "presets",
]);

function isActivation(value: unknown): value is Activation {
  return typeof value === "string" && activations.has(value as Activation);
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new SchemaParseError(
        "invalid-block-data",
        `${label}.${key} is not supported.`,
      );
    }
  }
}

function structuralNodes(value: unknown, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new SchemaParseError(
      "invalid-block-data",
      `${label} must be an array.`,
    );
  }
  return value.map((entry, index) => {
    if (!isPlainObject(entry) || typeof entry["type"] !== "string") {
      throw new SchemaParseError(
        "invalid-block-data",
        `${label}[${index}] must be a content node.`,
      );
    }
    return entry as JsonValue;
  });
}

export function parseInteractiveContent(
  value: unknown,
  parsers?: InteractiveContentParsers,
): InteractiveContent {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-block-data",
      "Interactive content must be an object.",
    );
  }
  rejectUnknown(value, contentKeys, "content");
  const content: {
    -readonly [Key in keyof InteractiveContent]?: InteractiveContent[Key];
  } = {};
  if (value["title"] !== undefined) {
    content.title = parsers
      ? parsers.parseTitle(value["title"])
      : structuralNodes(value["title"], "content.title");
  }
  if (value["description"] !== undefined) {
    content.description = parsers
      ? parsers.parseFlow(value["description"])
      : structuralNodes(value["description"], "content.description");
  }
  if (value["instructions"] !== undefined) {
    content.instructions = parsers
      ? parsers.parseFlow(value["instructions"])
      : structuralNodes(value["instructions"], "content.instructions");
  }
  for (const key of [
    "purpose",
    "observations",
    "assumptions",
    "fallback",
  ] as const) {
    if (value[key] !== undefined)
      content[key] = parsers
        ? parsers.parseFlow(value[key])
        : structuralNodes(value[key], `content.${key}`);
  }
  if (value["presets"] !== undefined) {
    if (!Array.isArray(value["presets"]) || value["presets"].length > 4096)
      throw new SchemaParseError(
        "invalid-block-data",
        "content.presets must be a bounded array.",
      );
    const ids = new Set<string>();
    content.presets = (value["presets"] as unknown[]).map((preset) => {
      if (
        !isPlainObject(preset) ||
        typeof preset["id"] !== "string" ||
        !preset["id"].trim() ||
        ids.has(preset["id"]) ||
        (preset["binding"] !== undefined &&
          typeof preset["binding"] !== "string")
      )
        throw new SchemaParseError(
          "invalid-block-data",
          "Preset associations require unique ids and optional fixed bindings.",
        );
      rejectUnknown(
        preset,
        new Set(["id", "binding", "description"]),
        "preset",
      );
      ids.add(preset["id"]);
      return {
        id: preset["id"],
        ...(typeof preset["binding"] === "string"
          ? { binding: preset["binding"] }
          : {}),
        ...(preset["description"] === undefined
          ? {}
          : {
              description: parsers
                ? parsers.parseFlow(preset["description"])
                : structuralNodes(preset["description"], "preset.description"),
            }),
      };
    });
  }
  return content;
}

function parseAccessibility(value: unknown): InteractiveAccessibility {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-block-data",
      "Interactive accessibility must be an object.",
    );
  }
  rejectUnknown(value, new Set(["label"]), "accessibility");
  if (value["label"] !== undefined && typeof value["label"] !== "string") {
    throw new SchemaParseError(
      "invalid-block-data",
      "accessibility.label must be a string.",
    );
  }
  return typeof value["label"] === "string" ? { label: value["label"] } : {};
}

export function isInteractiveEnvelope(
  value: unknown,
): value is InteractiveEnvelope<JsonValue> {
  if (!isPlainObject(value) || !isActivation(value["activation"])) return false;
  if (
    "alt" in value ||
    !Object.hasOwn(value, "payload") ||
    !isJsonValue(value["payload"])
  )
    return false;
  if (value["content"] !== undefined && !isPlainObject(value["content"]))
    return false;
  if (value["fallback"] !== undefined && !Array.isArray(value["fallback"]))
    return false;
  if (value["accessibility"] !== undefined) {
    if (!isPlainObject(value["accessibility"])) return false;
    const label = value["accessibility"]["label"];
    if (label !== undefined && typeof label !== "string") return false;
  }
  return true;
}

export function parseInteractiveEnvelope<Payload>(
  value: unknown,
  parsePayload: (value: unknown) => Payload,
  parsers?: InteractiveContentParsers,
): InteractiveEnvelope<Payload> {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-block-data",
      "Interactive block data must be an object.",
    );
  }
  rejectUnknown(value, envelopeKeys, "interactive");
  if (
    value["initialState"] !== undefined &&
    !isJsonValue(value["initialState"])
  )
    throw new SchemaParseError(
      "invalid-block-data",
      "Initial state must be JSON.",
    );
  const activation = value["activation"] ?? "visible";
  if (!isActivation(activation)) {
    throw new SchemaParseError(
      "invalid-block-data",
      "Interactive block activation must be load, visible, idle, or interaction.",
    );
  }
  const content =
    value["content"] === undefined
      ? undefined
      : parseInteractiveContent(value["content"], parsers);
  const fallback =
    value["fallback"] === undefined
      ? undefined
      : parsers
        ? parsers.parseFlow(value["fallback"])
        : structuralNodes(value["fallback"], "fallback");
  const accessibility =
    value["accessibility"] === undefined
      ? undefined
      : parseAccessibility(value["accessibility"]);
  return {
    activation,
    payload: parsePayload(value["payload"]),
    ...(value["initialState"] === undefined
      ? {}
      : { initialState: value["initialState"] as JsonValue }),
    ...(content === undefined ? {} : { content }),
    ...(fallback === undefined ? {} : { fallback }),
    ...(accessibility === undefined ? {} : { accessibility }),
  };
}

export interface ResourceReference {
  readonly uri: string;
  readonly transform?: string;
  readonly options?: JsonValue;
}

export interface PlannedResource {
  readonly originalUris?: readonly string[];
  readonly resolvedLocation?: string;
  readonly mediaType?: string;
  /** Exact file bytes, not a JCS digest of a JSON representation. */
  readonly byteDigest?: `sha256:${string}`;
  readonly external?: boolean;
  readonly dataset?: JsonValue;
  readonly uri: string;
  readonly identity: string;
  /** Host-supplied source content/revision identity, absent for unchecked references. */
  readonly version?: string;
  /** Source identities; transforms are represented separately in artifacts. */
  readonly dependencies?: readonly string[];
}

export interface PlannedArtifact {
  readonly identity: string;
  readonly sourceIdentity: string;
  readonly transform: string;
  readonly options?: JsonValue;
}

export interface ResourcePlan {
  readonly resources: readonly PlannedResource[];
  /** Optional for compatibility with previously constructed prepared plans. */
  readonly artifacts?: readonly PlannedArtifact[];
}

export type ReferenceKind =
  "heading" | "figure" | "table" | "equation" | "diagram";
export interface ReferenceTarget {
  readonly pointer?: string;
  readonly label: string;
  readonly blockId: BlockId;
  readonly kind: ReferenceKind;
  readonly ordinal?: number;
  readonly title?: string;
}
export interface ReferencePlan {
  readonly targets: readonly ReferenceTarget[];
}

export interface IslandPlan {
  readonly blockId: BlockId;
  readonly blockType: string;
  readonly activation: Activation;
  readonly displayName?: string;
}

export interface PreparedBlock extends Block<BlockType, unknown> {
  /** Derived, noneditable view verified against the original source before normalization. */
  readonly readableContent?: InteractiveContent;
  readonly prepared: true;
}

export interface PreparedDocument {
  readonly dependencies?: readonly import("./dependencies.ts").ContractDependency[];
  readonly extensions?: import("./json.ts").JsonObject;
  readonly sourceIdentity?: string;
  readonly semanticIdentity?: string;
  readonly diagnosticIdentity?: string;
  /** Declared locations in document order; opaque branches are excluded. */
  readonly traversal?: readonly (import("./traversal.ts").TraversalVisit & {
    readonly blockId: BlockId;
  })[];
  readonly sourceMap?: import("./diagnostic.ts").DocumentSourceMap;
  readonly kind: "publisle:prepared-document";
  readonly schemaVersion: number;
  readonly metadata?: PublicationMetadata;
  readonly blocks: readonly PreparedBlock[];
  readonly resources: ResourcePlan;
  readonly references: ReferencePlan;
  readonly islands: readonly IslandPlan[];
  readonly cacheIdentity: string;
}

export interface PrepareResult {
  readonly document?: PreparedDocument;
  readonly diagnostics: readonly import("./diagnostic.ts").Diagnostic[];
}

export function isPreparedDocument(
  value: Document | PreparedDocument,
): value is PreparedDocument {
  return "kind" in value && value.kind === "publisle:prepared-document";
}
