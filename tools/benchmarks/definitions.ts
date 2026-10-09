import { coreBlockDefinitions } from "../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../blocks/technical/src/index.ts";
import { defineInteractiveBlock } from "../../packages/block-sdk/src/index.ts";

export const definitions = [
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
  ...Array.from({ length: 20 }, (_, index) =>
    defineInteractiveBlock({
      type: `bench:impl-${String(index)}`,
      schemaVersion: 1,
      schema: {
        parse(value: unknown) {
          if (
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
          )
            throw new Error("Benchmark payload must be an object.");
          return value as { n: number };
        },
      },
      descriptor: {
        displayName: `Implementation ${String(index)}`,
        description: "Benchmark-only host island.",
        payloadSchema: {
          type: "object",
          properties: {
            n: { type: "number", description: "Benchmark index." },
          },
        },
      },
    }),
  ),
];
