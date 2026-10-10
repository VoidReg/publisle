# Packed package consumer

This starter exercises an installation outside the workspace. Requires Node.js
24 or later and pnpm 11.x.

For the full Core import, preparation, static HTML rendering, CLI and declaration
check, run from the repository root:

```sh
pnpm test:distribution
```

The command retains a temporary consumer and all 23 tarballs and prints their
location. From the retained `consumer/` directory, reproduce the checks:

```sh
npm ci --ignore-scripts --legacy-peer-deps
node consumer.ts
node node_modules/@publisle/cli/dist/bin.js validate source.json
node node_modules/@publisle/cli/dist/bin.js export source.json --to pdf
```

The last command exits 2 and explains how to install the optional Research plugin.
The Core installation contains no Research templates, citeproc, fflate or TeX.

For a minimal schema-only consumer, build and pack from the repository root:

```sh
pnpm build:packages
pnpm --filter @publisle/schema pack --pack-destination /tmp/publisle-packs
mkdir -p /tmp/publisle-schema-consumer
cd /tmp/publisle-schema-consumer
npm init -y
npm install /tmp/publisle-packs/publisle-schema-0.0.0.tgz
node --input-type=module -e '
import { parseDocument } from "@publisle/schema";
console.log(parseDocument({ schemaVersion: 1, blocks: [] }).schemaVersion);
'
```

Published exports resolve ESM JavaScript and declarations in `dist/`; workspace
exports continue to use TypeScript sources. `0.0.0` is the unreleased workspace
version, so replace the tarball filename if rehearsing a chosen beta release.
See the [release checklist](../../docs/guides/releases.md) and
[Python consumer](../../tools/python/README.md) for distribution and offline
conformance evidence.
