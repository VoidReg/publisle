# Independent Python consumer

Python 3.11+ can consume the reviewed beta JSON/schema subset without Node,
TypeScript, plugin code, network access or a package installation:

```sh
python3 -B -m unittest discover -s tools/python -v
python3 -B tools/python/publisle.py digest article.json
python3 -B tools/python/publisle.py bundle contracts.json
python3 -B tools/python/publisle.py validate data.json \
  --schema packages/contracts/schemas/paragraph.json \
  --dependencies packages/contracts/schemas/rich-content.json
```

Copy `tools/python` and the required pinned JSON schemas/fixtures to an offline
machine. Schema references resolve only to the explicitly supplied resources;
they never initiate retrieval. Validation is read-only: it does not insert
defaults, coerce types, normalize text, migrate data or execute refinements.
`format` is annotation-only. Patterns are restricted to the same finite reviewed
set as TypeScript. Unknown keywords, required vocabularies, unprovided references,
nonproductive recursion and evaluation-budget exhaustion are unsupported
contracts, not successful validation.

Ordinary numbers are parsed into binary64, including integer tokens. Exact large
integers/decimals must use declared string representations. Duplicate decoded
members, malformed UTF-8, lone surrogates, nonfinite values, cyclic programmatic
values and excessive input size/depth/node counts are rejected. JCS preserves
text and orders names by UTF-16 code units; SHA-256 hashes its UTF-8 bytes.

The consumer is a structural validator, not a renderer, scientific simulator,
HTML sanitizer or JavaScript preparer. Contract bundles are checked for exact
JCS seals, source/envelope identity, minimal schema closure, positive/negative
examples, dependency identity, graph bounds, capability consistency and inventory
locks. Locked documents require exact, used type/version/digest root pins and
unique block IDs. The bundle report explicitly identifies executable hooks and
semantic/traversal evaluation as unsupported. Those declarations are retained;
structural validity must not be presented as semantic binding verification or
computational equivalence. Schema validity does not establish safety or publisher
trust.
Apply host process/time/memory isolation to untrusted workloads in addition to
the consumer's bounded schema and evaluation budgets.

## Precompiled Python host demonstration

Build once in the trusted Node tooling environment into a **new** directory:

```sh
node tools/python/build-demo.ts /tmp/publisle-python-demo
```

The command prints the JCS digest of `site.json`. Transfer the emitted directory,
`tools/python` and that separately approved digest to the Python host:

```sh
python3 -B tools/python/serve.py /tmp/publisle-python-demo \
  --digest sha256:THE_PRINTED_DIGEST --port 8000
```

Open `http://127.0.0.1:8000`. Two placements of the article contain independent
host-owned counters, substantive fallback and intentionally unavailable
implementations. Browser modules are compiled during the build, shared by the
browser module cache, and loaded through a fixed host allowlist. The demo includes
no registry, schema, compiler, Markdown parser or Ajv in the reader. Three.js and
other engines remain host/user implementations, not Publisle dependencies.

The Python backend verifies the manifest pin and each file's raw-byte SHA-256,
allowlisted MIME, bounded counts/sizes and safe descriptor-relative paths before
listening. It denies symlinks/hardlinks and caches approved bytes; requests perform
only inventory lookup. Missing assets fail startup; unknown HTTP paths return 404.
No request parses source, discovers contracts, invokes Node, compiles components,
or evaluates document import strings. JavaScript-disabled readers retain fallback.
HTML/styles/scripts are separately host-approved; hashes are not sanitization.
This loopback standard-library demonstration is not a production Internet server;
production hosts still own authentication, rate limits, TLS, CSP and deployment.

`pnpm test:conformance:p0` runs the independent tests and cross-language/unit/browser
checks, then requires passing evidence for every TEST-01–10 group. Missing or
skipped evidence fails the gate. The required CI job runs this command; baseline
React/Svelte lifecycle, shared module, placement and reader-cost checks remain.

## Vendored dependency

The sole dependency is the unmodified, platform-independent
[rfc8785 0.1.4 wheel](https://pypi.org/project/rfc8785/0.1.4/), Apache-2.0 licensed.
Its copyright and license are included in the wheel. It is loaded directly with
Python zipimport after checking SHA-256
`520d690b448ecf0703691c76e1a34a24ddcd4fc5bc41d589cb7c58ec651bcd48`.
There are no native extensions or transitive dependencies. A maintainer can
reproduce the bundled wheel with:

```sh
python3 -m pip download --no-deps --only-binary=:all: \
  rfc8785==0.1.4 --dest tools/python/vendor
sha256sum tools/python/vendor/rfc8785-0.1.4-py3-none-any.whl
```

Downloading is a maintainer operation, never an offline-consumption step. Existing
Publisle package, schema, document and artifact versions remain frozen.
