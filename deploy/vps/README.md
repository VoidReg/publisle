# Internal website PDF service on OVH

This backend serves only the Publisle website. It is **not published to npm**.
The internal workspace and image-runtime manifests are private; the release gate
excludes them. The website remains static on GitHub Pages.

## Architecture and limits

Caddy forwards HTTPS to a Node 24 API on `127.0.0.1:8787`. The API admits one job
at a time, with at most two waiting requests and five attempts per IP per ten
minutes. The dedicated rootless runtime and API share `publisle-pdf.slice`, capped
at **0.5 vCPU and 512 MiB total**, including all compiler containers. Swap is
forbidden. Existing VPS workloads stay outside this hierarchy.

Each job validates editor data, obtains referenced public images, decodes images
in an isolated worker, then compiles with the existing research source generator
and `latexmk` in a fresh worker. Separating decoding from TeX releases decoder
memory before compilation. Workers have no network, capabilities, writable root
filesystem, or runtime socket. Their scratch space is 128 MiB, process count 64,
and memory limit 448 MiB; the aggregate 512-MiB ceiling still applies.

Default budgets: 256 KiB JSON, 12 distinct images, 4 MiB per download, 16 MiB total
input/converted images, eight megapixels per image, 16 MiB final PDF, 30 seconds
waiting and 180 seconds processing. PNG/JPEG remain raster images; self-contained
SVG is converted without a browser. Inline Markdown images become adjacent
figures. Interactive blocks retain readable static fallbacks. Missing images,
metadata, glyphs and citations fail explicitly. Publisher layouts retain their
existing accessibility limitations; standard LuaLaTeX articles retain PDF/UA
source defaults. Validation is performed in QA, not on every public request.

There is no database, object storage, upload endpoint or retained output cache.
Temporary files disappear after success, failure, cancellation or timeout.
Labeled orphan containers and job directories are removed on service restart.
Worker logging is disabled so binary PDF output is not written into runtime logs.
The API records only timing and failure codes.

## Local development and acceptance

```sh
pnpm install --frozen-lockfile
pnpm --filter @publisle/pdf-service build
docker build -f deploy/vps/worker.Dockerfile -t publisle-pdf-worker:local .
pnpm test:pdf-service
```

Run the real browser regression, including all editor modes and publication URL
checks, using the immutable image ID:

```sh
export PDF_TEST_WORKER_IMAGE="$(docker image inspect publisle-pdf-worker:local --format '{{.Id}}')"
node --test deploy/vps/tests/website.test.mjs
```

For manual website testing:

```sh
export PDF_WORKER_IMAGE="$PDF_TEST_WORKER_IMAGE"
PDF_ENABLED=true PDF_LOCAL_QA=true PDF_ORIGINS=http://localhost:4321 node deploy/vps/server.mjs
# In a second terminal:
PUBLIC_PDF_ENABLED=true PUBLIC_API_URL=http://127.0.0.1:8787 pnpm --filter @publisle/www dev
```

`PDF_LOCAL_QA` bypasses production resource/verification checks only outside
`NODE_ENV=production`. Its API still binds to loopback. Keep the CORS origin exact.

Run the aggregate feasibility gate on Linux with systemd user services, cgroup v2,
Docker CLI and `dockerd-rootless.sh` installed:

```sh
node deploy/vps/budget-check.mjs
```

This creates a separate temporary rootless daemon and transient user slice,
leaving the existing Docker daemon untouched. Image installation precedes the
compilation budget. API, runtime, image conversion and compiler then share the
hard limits. It compiles representative papers with citations, equations, tables,
external SVG and Arabic, and writes PDFs plus `budget.json` under
`.local/pdf-service-qa/`. Generated daemon data is retained in
`node_modules/.cache/publisle-pdf-qa/` for debugging. The QA runner itself is also
inside the budget, making the measurement conservative. External image availability
can fail this live gate; review the reported failure before diagnosing capacity.

**Do not enable production PDF when this gate fails.** Do not raise limits,
substitute a lossy exporter or disable tagging automatically. Re-run after worker
changes: readiness requires a passing report for the exact installed image.

## Provisioning the shared VPS

Supported target: Debian/Ubuntu with systemd and cgroup v2. Install Docker Engine
CLI and rootless extras from the official Docker repository first. Do not replace
or stop an existing shared Docker daemon. Configure DNS for `api.publisle.xyz`
and ensure ports 80/443 are already allowed by the host/network firewall.

Copy `deploy/vps/` to the VPS and run `sudo bash install.sh`. The installer creates
a dedicated `publisle` account/runtime, installs the aggregate resource hierarchy,
and starts the API with PDF disabled on first installation. It preserves existing
firewall rules and Caddy hosts. Existing API host configuration requires manual
review against the supplied Caddyfile. It restarts only the dedicated Publisle
user manager and API during updates. A rootless runtime must have delegated CPU,
memory and PID controllers; readiness fails if the required hierarchy is absent.

Build the worker on a development/build host, then transfer it with `docker save`
and load it into **publisle's rootless daemon**, using its
`DOCKER_HOST=unix:///run/user/<publisle-uid>/docker.sock`. Runtime requests never
build or pull images. Keep the previous image ID and verification report for rollback.

After all local acceptance and PDF/UA checks pass, install the reviewed matching
`budget.json` as `/etc/publisle-pdf-verified.json` (root-owned, mode 0644). Set these
in `/etc/publisle-api.env`:

```text
PDF_ENABLED=true
PDF_WORKER_IMAGE=sha256:<immutable-installed-image-id>
PDF_ORIGINS=https://publisle.xyz
PDF_ASSET_BASE=https://publisle.xyz/
```

When the public edge is another reverse proxy that cannot reach loopback (for
example a Dockerized nginx), also set `PDF_BIND` to an RFC1918 address on this
host, such as the Docker bridge gateway, and declare that proxy in
`PDF_TRUST_PROXY` (comma-separated IPs or IPv4 CIDRs). The API then serves on
`PDF_BIND` instead of loopback and derives the client identity for its
per-IP admission limits from the rightmost untrusted `X-Forwarded-For` entry.
Forward the original visitor address (`proxy_set_header X-Forwarded-For
$proxy_add_x_forwarded_for;`), keep body caps at 256 KiB and response timeouts
at or above 220 seconds, and never expose `PDF_BIND` to the public internet.
The installer skips Caddy when 80/443 already serve a non-Caddy edge; integrate
the API host into that proxy manually.

Preserve the installer's `HOME`, `XDG_RUNTIME_DIR` and `DOCKER_HOST` values.
Restart `publisle-api` and verify `/health` reports `services.pdf=true`. Readiness
checks the report, image availability, rootless runtime, cgroup v2 and aggregate
limits. Check the live host's memory/CPU usage as well; local timing is not an OVH
performance guarantee. Caddy and the host OS are shared infrastructure outside
the PDF service slice.

Only then set the GitHub repository variable `PUBLIC_PDF_ENABLED=true`; optionally
set `PUBLIC_API_URL`. Build/deploy the site using its existing workflow. Roll back
immediately by disabling that variable and setting `PDF_ENABLED=false`, or restore
the previous image and its matching verification report.

## API contract

- `GET /health`: API liveness and PDF readiness.
- `GET /pdf/capabilities`: enablement, seven shipped layouts, engines, metadata and limits.
- `POST /pdf/compile`: JSON containing exactly one of `document` or `markdown`,
  optional `template` (default `article`), supported `engine`, and optional
  `data.country` for ACM. All templates require title and authors.

`Accept: application/pdf` returns a PDF attachment and bounded base64-encoded JSON
warnings in `X-Publisle-Diagnostics`. Clients without that accept header retain
`{ok:true,pdfBase64,diagnostics}` compatibility. Errors return `{ok:false,code,message}`;
`429` includes `Retry-After`. Compilation logs and internal paths are not returned.

Images require public HTTPS with no credentials or custom ports. The downloader
checks every resolved address and redirect and pins connections to validated IPs.
Relative references resolve against `PDF_ASSET_BASE`. SVG scripts, external file
references, CSS imports and external resources are rejected. The independent
bibliography-fetching API is not used by this public service.
