# Performance calibration and budget review

Batch C retains the baseline/budget checkpoint from #58–60. No numerical
performance threshold is accepted yet. The grouped PR stays draft during
calibration; incremental host compilation (#60) follows review of the measured
baselines and proposed budgets. The earlier canonical byte-accounting improvement
has separate before/after evidence and exact-output regression checks.

## Calibration

`.github/workflows/performance.yml` pins Ubuntu 24.04, Node 24.21.0, pnpm 11.17.0,
and the lockfile's Playwright/Chromium revision. CPU model, RAM, kernel, commit and
input hashes accompany raw samples. Runner hardware is recorded, not guaranteed
identical across GitHub-hosted runs. Gzip uses level 6 (zlib's default level in the
preparation harness); browser responses are uncompressed loopback HTTP. Browser
measurements use one page at a time without CPU/network/device emulation.

PR runs collect full preparation baselines and a reader smoke calibration.
Scheduled/manual full runs and PRs labeled `performance:full` collect three
independent runner repetitions, each with 30 browser samples for one, five and 100
islands per placement in both frameworks and delivery paths. Two placements
exercise module sharing and independent state. Every browser run uses a fresh
context, after two excluded warmup contexts. Preparation uses five excluded
warmups and 30 samples, with 100 samples for short operations. Percentiles use
nearest rank and variance uses the sample denominator. Three-sample smoke runs
are checks that instrumentation works, not evidence of p95 latency.

Each workflow uploads complete or partial raw runs for 30 days. Reports reject
incomplete runs. Correctness failures, reader tooling leaks, premature island
imports and browser errors fail immediately. No numerical latency/byte gate is
enforced during calibration. Ignored local artifacts can be regenerated using
the commands in `tools/benchmarks/README.md`.

## Proposed review method

Collect at least three full runs on the same pinned software configuration.
Review per-workload raw samples and CPU metadata before selecting a baseline.
Propose deterministic budgets for HTML/gzip, host/framework JS, CSS and logical
props separately; overlapping props/CSS must not be added twice. Review timing
budgets independently for registry setup, reused-registry preparation, end-to-end
preparation, corpus throughput and first/all-island activation. No single
whole-system score can substitute for these boundaries.

The review table must record observed p50/p95/variance, the proposed numeric cap,
its headroom and rationale for every chosen gate. Exact caps remain blank until
calibration results are available and reviewed; this document does not invent
latency targets. JS heap, long tasks and CLS remain observations until stable,
meaningful scopes support their own budgets. Separate parse and evaluation costs,
other publishing compilers, external dataset delivery and mobile devices are not
yet measured. The synthetic identity graph is not a contract-resolution benchmark.

After acceptance, deterministic byte/correctness regressions fail on the first
run. A timing breach triggers exactly one clean rerun on the same software and
workload settings; preserve both raw runs and runner metadata. If both exceed
the accepted cap, fail the gate. If only one exceeds it, label the result noisy
and require review rather than silently declaring it passing. A hardware or
software change requires a new calibration proposal; never move thresholds to
make an optimization pass.
