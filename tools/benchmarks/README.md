# Preparation measurements

Run `node tools/benchmarks/measure.ts` to regenerate [the performance report](../../docs/standards/performance.md). Raw samples, environment metadata and correctness snapshots remain in ignored `benchmarks/latest/`. Completed workloads are checkpointed with `complete: false`; only a successful full run sets `complete: true`, and comparisons reject incomplete runs. Use `--output benchmarks/before` to retain a separate run before an optimization.

Preparation workloads use five excluded warmups and 30 recorded samples. Short operations use 100 samples. Fresh-process measurements use 30 separate processes without warmups. Percentiles use nearest rank; variance is sample variance. Gzip uses Node's default level.

The harness separates fixture construction, cloning, registry setup, preparation and publication serialization, and also measures them together. Scaling fixtures contain 100, 1000 and 10000 comparable paragraphs. The corpus is sequential preparation of 10000 one-paragraph documents. Island rows measure preparation only; the 100000-byte inline fixture is code text.

Run `node tools/benchmarks/measure.ts --profile --output benchmarks/profile` separately from timing runs. It writes a V8 CPU profile for process startup and first preparation, plus a phase breakdown from a separate instrumented preparation. Open `preparation.cpuprofile` with a CPU profile viewer. Inclusive timings contain nested phases; sum exclusive timings to avoid double counting. The exclusive portions of `prepare document` and `total` are unattributed overhead, including timing bookkeeping. Profiles are diagnostic observations, not benchmark samples; absent phases were not exercised by that fixture.

After an optimization, run `node tools/benchmarks/compare.ts benchmarks/before benchmarks/latest`. It replays baseline inputs with the original IDs and verifies prepared documents, diagnostics, identities and publication output exactly, then writes the median comparison to `benchmarks/latest/comparison.md`. It does not compare snapshots from independently generated fixtures because block IDs are random. For repeatable comparisons, keep the same Node version, hardware, workload order and sampling settings, and run the two measurements without competing work.

These results are not budgets or evidence of comparative whole-system speed. Repeated preparation is uncached. Persistent host caching, incremental reuse, mixed-content size comparisons, interactive competing compilers and independent contract-resolution measurements remain follow-up work.

## Matched static compilers and production readers

`node tools/benchmarks/matched.ts --output benchmarks/matched` compares the same
1000-paragraph source through handwritten HTML, Publisle and MDX 3.1.1. It also
records a varied prose/code/list/reference fixture. Inputs and output HTML are
retained alongside 30 raw paired samples after five warmups. Preparation-only,
Markdown parse/prepare/serialize, MDX compile, and MDX compile/evaluate/React
serialization are separate operations. This does not establish equivalent
interactive behavior or a whole-system ranking.

`node tools/benchmarks/browser.ts --output benchmarks/browser` builds the actual
Fourier React/Svelte components in production for native and artifact delivery.
It measures one, five and 100 islands per placement, with two placements per
fixture, 30 recorded samples and two excluded warmup contexts. `--smoke` limits
this to three observations at one island per placement; its p95 is the maximum
and is unsuitable for a latency budget. Chromium comes from the pinned Playwright
installation in CI. Locally, `PUBLISLE_BROWSER_PATH` overrides the executable;
otherwise the harness uses Google Chrome when available. The browser revision is
recorded, so results from different browsers are not interchangeable.

Every sample retains requests, aggregate script/task duration, first and remaining
activation wall time, document JS heap usage, long-task durations and CLS without
recent input. Assets record raw and gzip level-6 bytes. HTML includes inline CSS;
JS includes island inputs. Logical props/CSS sizes overlap delivered totals.
Fresh contexts clear HTTP caches, not the browser process's warmed code. There
is no simulated phone or separate parse/eval attribution. Preparation, compilation
and browser runs should execute sequentially on an idle host.

`node tools/benchmarks/report.ts benchmarks/browser` writes a summary table with
nearest-rank percentiles and sample variance. Partial runs cannot produce an
accepted report. Production builds fail for reader tooling leaks, premature
implementation requests and browser errors. CI uploads the raw observations. [Accepted budgets](../../docs/standards/performance-budgets.md) are enforced by `node tools/benchmarks/gate.ts`. A timing breach reruns the workload once; byte breaches fail immediately. Reader latency caps apply only to full calibrations.

`node tools/benchmarks/propose.ts <artifact-directory-1> <artifact-directory-2> <artifact-directory-3>` derives an unenforced review table from three complete full calibration artifacts. It rejects smoke runs, differing source/input hashes and differing software/sampling settings. The timing headroom is a review heuristic, not a confidence interval. The [current proposed caps](../../docs/standards/performance-budget-proposal.md) cite the immutable baseline run.
