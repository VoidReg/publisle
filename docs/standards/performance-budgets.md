# Performance calibration and accepted budgets

The caps in [`tools/benchmarks/accepted-budgets.json`](../../tools/benchmarks/accepted-budgets.json) are the reviewed budgets. They come from the three full CI repetitions recorded in [the proposal](performance-budget-proposal.md) (run 37934846094, baseline `1753e9b`). Timing caps are the largest observed run p95 plus twice the largest run standard deviation, rounded up to whole milliseconds. Byte caps are the largest observation plus the larger of the observed spread or 1%. Heap, long tasks, CLS, separate parse/eval, mobile devices, external datasets, and publishing compilers other than the pinned MDX comparison stay observations.

No cap is raised to make an optimization pass. A hardware or software pin change requires a new calibration proposal. The earlier canonical byte-accounting improvement has separate before/after evidence and exact-output regression checks. Host compilation caching reuses unchanged documents outside reader bundles; the budgeted preparation rows stay uncached.

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
imports and browser errors fail immediately. Every run enforces the accepted
preparation timing caps and the byte caps for measurements it actually
produced. Reader latency caps run only on the scheduled job, manual full
runs, and pull requests labeled `performance:full`. A smoke reader's p95 is
an instrumentation check, not a latency gate. Ignored local artifacts can be
regenerated using the commands in `tools/benchmarks/README.md`.

## Proposed review method

Collect at least three full runs on the same pinned software configuration.
Review per-workload raw samples and CPU metadata before selecting a baseline.
Propose deterministic budgets for HTML/gzip, host/framework JS, CSS and logical
props separately; overlapping props/CSS must not be added twice. Review timing
budgets independently for registry setup, reused-registry preparation, end-to-end
preparation, corpus throughput and first/all-island activation. No single
whole-system score can substitute for these boundaries.

The review table records observed p50/p95/variance, the accepted numeric cap,
its headroom and rationale for every chosen gate. The [concrete proposal](performance-budget-proposal.md) records three full CI
repetitions and the explicit headroom heuristic. Those numeric caps are now
enforced from the budget file. JS heap, long tasks and CLS remain observations until stable,
meaningful scopes support their own budgets. Separate parse and evaluation costs,
other publishing compilers, external dataset delivery and mobile devices are not
yet measured. The synthetic identity graph is not a contract-resolution benchmark.

Deterministic byte and correctness regressions fail on the first run. A timing
breach reruns that workload once on the same software and workload settings;
both raw runs and runner metadata are kept. If both exceed the accepted cap,
the gate fails. If only one exceeds it, the result is noisy: the disagreement
stays in the log and does not fail the job, because runner noise of a fraction
of a millisecond is not a reproduced regression. A hardware or software change
requires a new calibration proposal; never move thresholds to make an
optimization pass.
