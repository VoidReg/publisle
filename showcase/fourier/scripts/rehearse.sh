#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: ./scripts/rehearse.sh /absolute/path/to/distribution/tarballs" >&2
  exit 2
fi
case "$1" in /*) tarballs=$1 ;; *) echo "Use an absolute tarball directory." >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
mkdir -p .artifacts
node --input-type=module - "$tarballs" <<'JS'
import assert from 'node:assert/strict';
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, requested] of Object.entries(dependencies)) {
  if (!name.startsWith('@publisle/')) continue;
  const match = /^file:\.artifacts\/(publisle-[a-z-]+-[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?\.tgz)$/.exec(requested);
  assert(match, `Expected a pinned packed artifact for ${name}: ${requested}`);
  copyFileSync(join(process.argv[2], match[1]), join('.artifacts', match[1]));
}
JS
# Packed tarball bytes are not reproducible across machines (gzip embeds
# timestamps), so the committed lock's recorded digests never match a fresh
# pack — npm enforces them even on plain install. Generate the lock in an
# empty directory: reusing node_modules while recreating a missing lock can
# omit registry integrity metadata. Then replay that lock with a clean install.
npm_cli=$(command -v npm)
rehearsal_stage=$(mktemp -d "${TMPDIR:-/tmp}/publisle-showcase-lock.XXXXXX")
trap 'rm -rf "$rehearsal_stage"' EXIT
cp package.json "$rehearsal_stage/"
cp -R .artifacts "$rehearsal_stage/"
(
  cd "$rehearsal_stage"
  node "$npm_cli" install --package-lock-only --ignore-scripts --legacy-peer-deps --no-audit --no-fund
)
cp "$rehearsal_stage/package-lock.json" package-lock.json
node "$npm_cli" ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node node_modules/astro/bin/astro.mjs build
node scripts/verify.ts
