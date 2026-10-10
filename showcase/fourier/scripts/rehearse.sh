#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: ./scripts/rehearse.sh /absolute/path/to/distribution/tarballs" >&2
  exit 2
fi
case "$1" in /*) tarballs=$1 ;; *) echo "Use an absolute tarball directory." >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
mkdir -p .artifacts
for package in schema contracts core block-sdk blocks-core blocks-technical markdown profiles adapter-core adapter-astro cli; do
  cp "$tarballs/publisle-$package-0.0.0.tgz" .artifacts/
done
# npm install, not ci: `pnpm pack` output is not byte-reproducible across
# machines (gzip embeds timestamps), so freshly packed tarballs never match the
# committed lock's recorded digests. The rehearsal records the actual audited
# digests into the lock; the verify step asserts installed content against it.
node "$(command -v npm)" install --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node node_modules/astro/bin/astro.mjs build
node scripts/verify.ts
