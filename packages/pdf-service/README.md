# Internal website PDF worker

This is private infrastructure for `publisle.xyz`, not a released Publisle npm
package. `private: true`, the absence of `publishConfig`, the explicit release
package list, and a release regression test keep it out of npm publication and
versioning. Do not add it to `packages/core-packages.json` or public changesets.

Build with `pnpm --filter @publisle/pdf-service build`. The bundle is installed
only in the internal worker image described in [the VPS runbook](../../deploy/vps/README.md).

The worker has three operations: document validation/lowering, image decoding,
and TeX compilation. Each runs in a separate short-lived container. Image decoder
memory is released before LuaLaTeX starts. External acquisition belongs to the
API; workers have no network and never receive credentials or host configuration.

The compiler uses the existing research source generator, shipped template
registries, citation resolver and `latexmk`. It checks missing glyphs and unresolved
references, preserves tagging defaults, and reports publisher tagging limitations.
It omits source archives, CLI startup and repeated immutable dependency probes.
The Node/TeX image bases and native image dependencies are pinned. Font caches
are prepared during image construction; all job writes remain in bounded scratch.
