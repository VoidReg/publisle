# Minimal schema consumer

This starter is for a clean install of the packed schema package. It is not a reader, editor, or marketplace.

From the repository root:

```sh
pnpm --filter @publisle/schema pack --pack-destination /tmp/publisle-packs
mkdir -p /tmp/publisle-consumer
tar -xzf /tmp/publisle-packs/publisle-schema-*.tgz -C /tmp/publisle-consumer
```

The tarball includes the MIT `license` field and the `src` export. It does not include adapter, compiler, or reader packages.

```sh
node --experimental-strip-types --input-type=module -e '
import { parseDocument } from "file:///tmp/publisle-consumer/package/src/index.ts";
console.log(parseDocument({ schemaVersion: 1, blocks: [] }).schemaVersion);
'
```

Optional offline checks use `@publisle/contracts` schemas and [the Python consumer](../../tools/python/README.md). Copy those files with the pack; do not import them from a production reader.
