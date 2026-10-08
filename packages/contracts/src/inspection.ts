import {
  canonicalizeJson,
  isPlainObject,
  parseDocument,
  parseJson,
  resolvePointer,
  resolveReadable,
  type JsonObject,
  type JsonValue,
} from "@publisle/schema";
import { digestJson } from "./canonical.ts";
import {
  resolveContracts,
  type ContractResolutionOptions,
} from "./resolution.ts";
import { validateSemanticBindings } from "./semantics.ts";
import { validateStructure } from "./validate.ts";
import { BETA_SCHEMAS, BETA_SCHEMA_DEPENDENCIES } from "./schemas.ts";
import type { ExportedContract } from "./export.ts";

export interface InspectionOptions extends ContractResolutionOptions {
  readonly mode?: "linked" | "standalone";
}

function json(value: unknown): JsonValue {
  return parseJson(canonicalizeJson(value));
}

/** Build/save-time JSON-only extraction. No registry, renderer or simulation. */
export async function exportSemanticDocument(
  source: unknown,
  options: InspectionOptions = {},
): Promise<JsonObject> {
  if (![undefined, "linked", "standalone"].includes(options.mode))
    throw new RangeError("Unsupported semantic export mode");
  let projectedValueBytes = 0;
  const boundJson = (value: unknown): JsonValue => {
    const text = canonicalizeJson(value);
    projectedValueBytes += new TextEncoder().encode(text).byteLength;
    if (projectedValueBytes > 2 * 1024 * 1024)
      throw new RangeError(
        "Semantic bound values exceed the 2 MiB projection budget; source remains authoritative",
      );
    return parseJson(text);
  };
  const archived = json(source);
  const validation = validateStructure(
    archived,
    BETA_SCHEMAS.document,
    BETA_SCHEMA_DEPENDENCIES.filter(
      (schema) => schema !== BETA_SCHEMAS.document,
    ),
  );
  if (!validation.valid)
    throw new Error(
      validation.diagnostics.map((entry) => entry.message).join("; "),
    );
  const document = parseDocument(archived);
  const sourceDigest = await digestJson(archived);
  const entries = new Map<string, ExportedContract>();
  const closures = new Map<string, ExportedContract>();
  const unresolved: JsonObject[] = [];
  for (const pin of document.dependencies ?? []) {
    if (
      !document.blocks.some(
        (block) =>
          block.type === pin.type && block.schemaVersion === pin.schemaVersion,
      )
    ) {
      unresolved.push({
        contract: json(pin),
        status: "unused",
        reason:
          "Pin is preserved in canonical source but not required for inspecting any block",
      });
      continue;
    }
    try {
      const bundle = await resolveContracts([pin], options);
      for (const entry of bundle.contracts) closures.set(entry.id, entry);
      const entry = bundle.contracts.find((entry) => entry.id === pin.id);
      if (entry) entries.set(pin.id, entry);
    } catch (error) {
      // Integrity/unsupported errors are not reclassified as a harmless missing pin.
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "missing-offline-contract"
      )
        throw error;
      unresolved.push({
        contract: json(pin),
        status: "unresolved",
        reason: error.message,
      });
    }
  }
  const ids = new Set<string>();
  const blocks: JsonObject[] = [];
  for (const [index, block] of document.blocks.entries()) {
    if (ids.has(block.id)) throw new Error(`Duplicate block ID: ${block.id}`);
    ids.add(block.id);
    const pointer = `/blocks/${String(index)}`;
    const pin = document.dependencies?.find(
      (pin) =>
        pin.type === block.type && pin.schemaVersion === block.schemaVersion,
    );
    const entry = pin ? entries.get(pin.id) : undefined;
    const body = entry?.contract;
    const diagnostics: JsonObject[] = [];
    const bound: JsonObject[] = [];
    if (!pin || !entry)
      diagnostics.push({
        code: pin ? "unresolved-contract" : "missing-contract-pin",
        pointer,
        status: "unresolved",
      });
    if (body) {
      const result = body.semantics
        ? validateSemanticBindings(
            body.semantics,
            block.data,
            body.source.dataSchema,
            body.source.schemaDependencies ?? [],
          )
        : validateStructure(
            block.data,
            body.source.dataSchema,
            body.source.schemaDependencies ?? [],
          );
      if (!result.valid)
        diagnostics.push(
          ...result.diagnostics.map(
            (diagnostic) => json(diagnostic) as JsonObject,
          ),
        );
      // A bad binding/type is visible, never treated as interpreted meaning.
      if (result.valid)
        for (const [entityIndex, entity] of (
          body.semantics?.entities ?? []
        ).entries()) {
          const location =
            entity.binding === undefined
              ? undefined
              : resolvePointer(block.data, entity.binding);
          bound.push({
            declaration: json(entity),
            declarationPointer: `/semantics/entities/${String(entityIndex)}`,
            sourceBlockId: block.id,
            pointer:
              entity.binding === undefined
                ? pointer
                : `${pointer}/data${entity.binding}`,
            sourceDigest,
            contract: pin ? json(pin) : null,
            explanationStatus:
              entity.origin === "authored"
                ? "authored"
                : entity.origin === "declared-rule"
                  ? "deterministically-derived"
                  : "unresolved",
            // A calculated-result declaration is NOT verification provenance.
            verification: "not-established",
            ...(location?.found ? { value: boundJson(location.value) } : {}),
            ...(location && !location.found ? { status: "unresolved" } : {}),
          });
        }
    }
    let explanation: JsonValue = null;
    let explanationStatus = "unresolved";
    if (block.readable) {
      const expected = await digestJson({
        id: block.id,
        type: block.type,
        schemaVersion: block.schemaVersion,
        data: block.data,
      });
      if (block.readable.sourceDigest !== expected) {
        diagnostics.push({
          code: "stale-readable-source",
          pointer: `${pointer}/readable`,
          status: "unresolved",
        });
      } else {
        try {
          explanation = boundJson(resolveReadable(block.readable, block.data));
          explanationStatus =
            block.readable.provenance.kind === "authored"
              ? "authored"
              : "unresolved";
          if (block.readable.provenance.kind === "generated")
            diagnostics.push({
              code: "unverified-generated-explanation",
              pointer: `${pointer}/readable/provenance`,
              status: "unresolved",
            });
        } catch (error) {
          if (error instanceof RangeError) throw error;
          diagnostics.push({
            code: "unresolved-readable",
            pointer: `${pointer}/readable`,
            reason:
              error instanceof Error
                ? error.message
                : "Unsupported explanation",
          });
        }
      }
    } else if (
      isPlainObject(block.data) &&
      Object.hasOwn(block.data, "content") &&
      block.data["content"] !== undefined
    ) {
      const content = block.data["content"];
      const checked = validateStructure(
        content,
        BETA_SCHEMAS.explanation,
        BETA_SCHEMA_DEPENDENCIES.filter(
          (schema) => schema !== BETA_SCHEMAS.explanation,
        ),
      );
      if (checked.valid) {
        explanation = boundJson(content);
        explanationStatus = "authored";
      } else
        diagnostics.push({
          code: "unsupported-explanation",
          pointer: `${pointer}/data/content`,
          status: "unresolved",
        });
    }
    const presets: JsonObject[] = [];
    if (isPlainObject(explanation) && Array.isArray(explanation["presets"])) {
      for (const preset of explanation["presets"] as unknown[]) {
        if (!isPlainObject(preset)) continue;
        const binding = preset["binding"];
        const location =
          typeof binding === "string"
            ? resolvePointer(block.data, binding)
            : undefined;
        presets.push({
          id: json(preset["id"]),
          pointer:
            typeof binding === "string"
              ? `${pointer}/data${binding}`
              : `${pointer}/data/content/presets`,
          status: location?.found ? "authored" : "unresolved",
          verification: "not-established",
          ...(location?.found ? { value: boundJson(location.value) } : {}),
        });
      }
    }
    blocks.push({
      id: block.id,
      type: block.type,
      schemaVersion: block.schemaVersion,
      pointer,
      sourceDigest,
      dataDigest: await digestJson(block.data),
      contract: pin ? json(pin) : null,
      composition:
        body?.semantics?.composition && diagnostics.length === 0
          ? {
              declaration: boundJson(body.semantics.composition),
              pointer: "/semantics/composition",
              status: "declared-rule",
              verification: "not-executed",
              sourceBlockId: block.id,
              sourceDigest,
              contract: pin ? json(pin) : null,
            }
          : null,
      represents: body
        ? {
            name: body.source.documentation.name,
            purpose: body.source.documentation.purpose,
          }
        : null,
      entities: bound,
      presets,
      explanation: {
        content: explanation,
        status: explanationStatus,
        pointer: block.readable
          ? `${pointer}/readable`
          : `${pointer}/data/content`,
        provenance: block.readable ? json(block.readable.provenance) : null,
      },
      unreproducible: body
        ? json({
            executable: body.portability.executable,
            limitations: body.portability.limitations,
          })
        : { reason: "No verified contract is available" },
      diagnostics,
    });
  }
  return {
    profile: "urn:publisle:semantic-export:beta",
    mode: options.mode ?? "linked",
    source: { digest: sourceDigest, schemaVersion: document.schemaVersion },
    dependencies: json(document.dependencies ?? []),
    ...(options.mode === "standalone"
      ? {
          contracts: json(
            [...closures.values()].sort((a, b) =>
              a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
            ),
          ),
        }
      : {}),
    resources: {
      policy: "references-only; no implicit dataset or executable retrieval",
    },
    blocks,
    unresolved,
  };
}

/** Same extraction in both modes; delivery of immutable contracts is the only difference. */
export async function inspectDocument(
  source: unknown,
  options: InspectionOptions = {},
): Promise<JsonObject> {
  const exported = await exportSemanticDocument(source, options);
  const records = (value: unknown): JsonObject[] =>
    Array.isArray(value)
      ? value.filter((entry: unknown): entry is JsonObject =>
          isPlainObject(entry),
        )
      : [];
  const blocks = records(exported["blocks"]).map((block) => {
    const entities = records(block["entities"]);
    const select = (kinds: readonly string[]) =>
      entities.filter((entity) => {
        const declaration = entity["declaration"];
        if (!isPlainObject(declaration)) return false;
        const kind = declaration["kind"];
        return typeof kind === "string" && kinds.includes(kind);
      });
    return {
      id: block["id"] ?? null,
      pointer: block["pointer"] ?? null,
      sourceDigest: block["sourceDigest"] ?? null,
      contract: block["contract"] ?? null,
      answers: {
        represents: block["represents"] ?? null,
        canChange: select(["input", "action"]),
        affects: select(["input", "action", "relation"]),
        observed: select(["output", "view", "evidence"]),
        illustratedStates: {
          declared: select(["state"]),
          presets: block["presets"] ?? [],
          composition: block["composition"] ?? null,
        },
        assumptions: {
          declared: select(["assumption"]),
          explanation: block["explanation"] ?? null,
        },
        cannotReproduce: block["unreproducible"] ?? null,
      },
      diagnostics: block["diagnostics"] ?? [],
    };
  });
  return { ...exported, profile: "urn:publisle:inspection:beta", blocks };
}
