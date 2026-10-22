#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "Usage: ./scripts/rehearse.sh /absolute/path/to/distribution/tarballs" >&2
  exit 2
fi
case "$1" in /*) tarballs=$1 ;; *) echo "Use an absolute tarball directory." >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
# The article and its assets have one source of truth in examples/articles;
# the showcase serves copies so the built site stays self-contained.
cp ../../examples/articles/fourier-series.md public/fourier-series.md
cp ../../examples/articles/fourier-square-wave.svg public/fourier-square-wave.svg
cp ../../examples/articles/fourier-clock.json public/fourier-clock.json
mkdir -p .artifacts
node --input-type=module - "$tarballs" <<'JS'
import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const report = JSON.parse(readFileSync(join(dirname(process.argv[2]), 'release-manifest.json'), 'utf8'));
for (const name of Object.keys(packageJson.dependencies)) {
  if (!name.startsWith('@publisle/')) continue;
  const version = report.versions[name];
  assert(typeof version === 'string' && /^0\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version), `Missing validated version for ${name}`);
  const filename = `${name.slice(1).replaceAll('/', '-')}-${version}.tgz`;
  copyFileSync(join(process.argv[2], filename), join('.artifacts', filename));
  packageJson.dependencies[name] = `file:.artifacts/${filename}`;
}
writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
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
  node "$npm_cli" install --package-lock-only --ignore-scripts --no-audit --no-fund
)
cp "$rehearsal_stage/package-lock.json" package-lock.json
node "$npm_cli" ci --ignore-scripts --no-audit --no-fund
node node_modules/astro/bin/astro.mjs build
node scripts/verify.ts
