import {
  defineInteractiveBlock,
  migrateInteractiveEnvelope,
} from "@publisle/block-sdk";
import { parseFlowNodes, parseInlineNodes } from "@publisle/blocks-core";
import { builtinContractSource } from "@publisle/contracts/builtin-sources";
import {
  SchemaParseError,
  createBlock,
  type InteractiveEnvelope,
  type JsonValue,
} from "@publisle/schema";

export interface SchematicPayload {
  readonly source: string;
}

export type InteractiveSchematicData = InteractiveEnvelope<SchematicPayload>;

const payloadKeys = new Set(["source"]);

export const interactiveSchematicDefinition = defineInteractiveBlock({
  type: "publisle:interactive-schematic",
  contract: builtinContractSource("interactive-schematic"),
  schemaVersion: 2,
  descriptor: {
    displayName: "Interactive schematic",
    description:
      "Presents an external schematic document. The sample island adds Clock and Reset controls.",
    payloadSchema: {
      type: "object",
      description:
        "External schematic resource. This version does not define a netlist, simulator, or inspection format.",
      properties: {
        source: {
          type: "string",
          description:
            "URI of the schematic document. The current renderer does not interpret the file format.",
        },
      },
      required: ["source"],
    },
    documentation:
      "The sample island provides Clock and Reset controls. It does not parse or simulate the source document.",
    capabilities: {
      staticRendering: false,
      networkAccess: false,
      hostServices: [],
    },
  },
  schema: {
    parse(value): SchematicPayload {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new SchemaParseError(
          "invalid-block-data",
          "schematic payload must be an object.",
        );
      const data = value as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (!payloadKeys.has(key))
          throw new SchemaParseError(
            "invalid-block-data",
            `schematic payload.${key} is not supported.`,
          );
      }
      const source = data["source"];
      if (typeof source !== "string")
        throw new SchemaParseError(
          "invalid-block-data",
          "schematic payload.source must be a string.",
        );
      return { source };
    },
  },
  content: {
    parseTitle: (value) =>
      parseInlineNodes(value, "content.title") as readonly JsonValue[],
    parseFlow: (value) => parseFlowNodes(value) as readonly JsonValue[],
  },
  migrations: [{ from: 1, migrate: migrateInteractiveEnvelope }],
  resources: (payload) => [{ uri: payload.source }],
});

export const interactiveSchematic = (data: InteractiveSchematicData) =>
  createBlock({
    type: interactiveSchematicDefinition.type,
    schemaVersion: 2,
    data,
  });
