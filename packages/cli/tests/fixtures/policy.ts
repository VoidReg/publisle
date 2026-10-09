import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { accessibilityProfile } from "../../../profiles/src/index.ts";
import type { CliConfig } from "../../src/index.ts";

export default {
  prepare: {
    registry: createRegistry(coreBlockDefinitions),
    profiles: [accessibilityProfile()],
    diagnosticPolicy: { "missing-alternative-text": "error" },
  },
} satisfies CliConfig;
