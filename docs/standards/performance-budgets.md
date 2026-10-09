# Performance calibration and accepted budgets

The caps in [`tools/benchmarks/accepted-budgets.json`](../../tools/benchmarks/accepted-budgets.json) are a recorded snapshot from the three full runner repetitions in [the proposal](performance-budget-proposal.md) (run 37934846094, baseline `1753e9b`). Timing figures are the largest observed run p95 plus twice the largest run standard deviation, rounded up to whole milliseconds. Byte figures are the largest observation plus the larger of the observed spread or 1%. Heap, long tasks, CLS, separate parse/eval, mobile devices, external datasets, and publishing compilers other than the pinned MDX comparison stay observations.

These numbers are a one-time comparison record. GitHub Actions does not measure them and does not fail a pull request against them. A later machine, registry, or startup change is expected to move the timings. Compare a new local run with the snapshot when that comparison is useful. Do not edit the stored numbers to match a new machine.

The earlier canonical byte-accounting improvement has separate before/after evidence and exact-output regression checks. Host compilation caching reuses unchanged documents outside reader bundles; the budgeted preparation rows stay uncached.

## How the snapshot was collected

That calibration used Ubuntu 24.04, Node 24.21.0, pnpm 11.17.0, and the lockfile's Playwright/Chromium revision. CPU model, RAM, kernel, commit and input hashes accompany the raw samples. Runner hardware was recorded and was not the same machine on every repetition. Gzip uses level 6 (zlib's default level in the preparation harness); browser responses were uncompressed loopback HTTP. Browser measurements used one page at a time without CPU/network/device emulation.

A full local run uses 30 browser samples for one, five and 100 islands per placement in both frameworks and delivery paths. Two placements exercise module sharing and independent state. Every browser run uses a fresh context, after two excluded warmup contexts. Preparation uses five excluded warmups and 30 samples, with 100 samples for short operations. Percentiles use nearest rank and variance uses the sample denominator. A three-sample smoke run checks that instrumentation works. It is not evidence of p95 latency.

Reports reject incomplete runs. Correctness failures, reader tooling leaks, premature island imports and browser errors stop the local harness. `node tools/benchmarks/gate.ts` can compare a completed local run with the snapshot. That comparison is optional and is not a merge check. Regenerate ignored local artifacts with the commands in `tools/benchmarks/README.md`.

## Proposed review method

Collect at least three full runs on the same pinned software configuration.
Review per-workload raw samples and CPU metadata before selecting a baseline.
Propose deterministic budgets for HTML/gzip, host/framework JS, CSS and logical
props separately; overlapping props/CSS must not be added twice. Review timing
budgets independently for registry setup, reused-registry preparation, end-to-end
preparation, corpus throughput and first/all-island activation. No single
whole-system score can substitute for these boundaries.

The review table records observed p50/p95/variance, the recorded numeric allowance,
and its headroom. The [concrete proposal](performance-budget-proposal.md) records three full
repetitions and the explicit headroom heuristic. Those numbers stay in the budget
file as a snapshot. JS heap, long tasks and CLS remain observations until stable,
meaningful scopes support their own budgets. Separate parse and evaluation costs,
other publishing compilers, external dataset delivery and mobile devices are not
yet measured. The synthetic identity graph is not a contract-resolution benchmark.

A local `gate.ts` comparison can report byte differences on the first run and can
rerun a timing workload once. That report does not fail GitHub. A hardware or
software change is a reason to run a new local comparison, not to edit the stored
snapshot so a check turns green.
