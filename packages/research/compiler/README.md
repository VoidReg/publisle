# Compiler recipe

Recipe 2 retains the Ubuntu noble-20250127 OCI index digest and the Ubuntu apt
snapshot at 2025-03-01 for OS dependencies. TeX comes from the upstream frozen
[TeX Live 2025 final repository](https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2025/tlnet-final/),
frozen on 2026-03-01, rather than noble's older TeX packages. The installer and
package database are pinned by SHA-512 in `install-texlive.sh`. TeX Live verifies
package archive checksums from that database. The original database is retained
as `/opt/texlive/tlpkg/frozen-source.tlpdb` in the image. Documentation and source
packages are omitted. See [TUG's historic release policy](https://tug.org/texlive/acquire.html).

The recipe maps Docker `amd64` to `x86_64-linux` and `arm64` to `aarch64-linux`,
using the same frozen package database and its platform-specific archive
checksums. Both architectures use the snapshot service's `ubuntu` archive,
which includes arm64 package indices; the ordinary `ubuntu-ports` path is not
a snapshot-service archive.

`release.json` stores the reviewed multi-architecture registry reference. It is
currently `null`: registry publication and a native arm64 CI run remain pending.
Both platforms are locally verified against this recipe: the amd64 image passes
the publisher smoke and PDF/UA fixture gates natively, and the arm64 image —
confirmed `linux/arm64` by `docker image inspect` — passed the five-publisher
smoke gate and all three PDF/UA fixtures (English UA-2, Arabic UA-2, English
UA-1) with veraPDF 1.28.2 under QEMU emulation on 2026-10-10. Until a release is
recorded, default setup builds locally.

```sh
docker build --tag publisle-compiler:2 packages/research/compiler
pnpm cli setup compiler
# Explicitly use the bundled local recipe, even after registry publication:
pnpm cli setup compiler --build
# Install a reviewed immutable registry reference:
pnpm cli setup compiler --image ghcr.io/voidreg/publisle-compiler@sha256:<index-digest>
```

Setup prefers the digest-pinned published image when `release.json` contains a
reference. It verifies the pulled repository digest and records the selected
platform's immutable local `sha256` ID, recipe version, platform, and published
index reference. Pull failures report the explicit `--build` fallback. The local
build uses the same frozen recipe. `publisle doctor` reports native compiler
readiness, container runtime readiness, installed image ID, platform and registry
reference separately. Runtime exports never pull or build; they use
`--pull=never`, a read-only container, a temporary cache, and no network. The
container uses `openin_any=r` so LuaTeX can read absolute paths to Unicode data
within its own compiler filesystem; its only host mount is the isolated source
package. Native execution retains `openin_any=p`. Both disable shell escape and
restrict output paths. Selection checks the LaTeX format before using a tagged
compiler.
Native tools remain supported; tagged output requires LaTeX 2025-11-01 or later.
See [accessibility](../../../docs/guides/accessibility.md) for the UA-2 fixture
gate and checksum-pinned veraPDF installation.

`cacert.pem` is the Mozilla CA bundle distributed by https://curl.se/ca/cacert.pem,
retained to bootstrap HTTPS apt on the minimal base. Its SHA-256 is
`a41b5d356aea97a529fe27e0f7316d2f9d946d75927476cf9cf1b90637d00505`.
Original certificate notices are retained; Mozilla CA data is under MPL 2.0.
TeX Live and installed packages retain their own license notices in the image.

## Release workflow

Run `.github/workflows/compiler-release.yml` manually with a new immutable
`recipe-X.Y.Z` version after reviewing the recipe. It uses native GitHub amd64
and arm64 runners, avoiding emulation. Each platform first builds the frozen
recipe, compiles all five shipped publisher profiles, and passes both standard
article profiles through the checksum-pinned veraPDF 1.28.2 PDF/UA-2 gate plus
the English PDF/UA-1 fixture. It
retains fixture PDFs and validation reports, then pushes that verified platform
image to `ghcr.io/<repository-owner>/publisle-compiler`. The repository's
`GITHUB_TOKEN` needs package write access and permission to create or update that
package. Existing release tags are refused.

The final job combines the two platform digests into an OCI index, checks that
it contains exactly `linux/amd64` and `linux/arm64` with the expected digests,
and uploads `compiler-release.json` plus the raw manifest. That record includes
the index digest, both platform digests, recipe version, and veraPDF pin. Review
and copy the generated record into `release.json` in the package release change;
setup then pulls that immutable index. The workflow does not edit the repository
or automatically change the default compiler. No published image or arm64
verification is claimed until this workflow succeeds.
