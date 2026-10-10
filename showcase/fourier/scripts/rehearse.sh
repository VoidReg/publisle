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
# Packed tarball bytes are not reproducible across machines (gzip embeds
# timestamps), so the committed lock's recorded digests never match a fresh
# pack — npm enforces them even on plain install. Rebuild the lock from the
# exact pinned package.json versions and the tarballs being rehearsed; the
# verify step asserts installed content against that fresh lock.
rm -f package-lock.json
node "$(command -v npm)" install --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node node_modules/astro/bin/astro.mjs build
node scripts/verify.ts
