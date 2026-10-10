// Trusted host configuration for the interactive research paper demo. It
// registers the schematic island so the zero-TeX HTML preview can prepare the
// document. Print exports never execute it: interactive blocks reduce to their
// authored fallback prose, with the reduction named in the export diagnostics.
// Relative source imports keep the file loadable from its location outside
// any package's dependency tree.
import { coreBlockDefinitions } from "../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../blocks/technical/src/index.ts";
import { createRegistry } from "../../packages/core/src/index.ts";
import type { CliConfig } from "../../packages/cli/src/index.ts";

const config: CliConfig = {
  prepare: {
    registry: createRegistry([
      ...coreBlockDefinitions,
      interactiveSchematicDefinition,
    ]),
  },
};

export default config;
