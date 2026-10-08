import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { researchPaperProfile } from "../../../profiles/src/index.ts";
import type { CliConfig } from "../../src/index.ts";

export default {
  prepare: {
    registry: createRegistry(coreBlockDefinitions),
    profiles: [researchPaperProfile()],
    diagnosticPolicy: { "missing-title": "error" },
  },
} satisfies CliConfig;
