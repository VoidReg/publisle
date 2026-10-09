# Preparation performance measurements

These measurements establish preparation and serialization costs, not comparative whole-system speed or performance budgets. The static fixture demonstrates negligible HTML size overhead.

Regenerate with `node tools/benchmarks/measure.ts`. This rewrites this report and retains raw samples and correctness snapshots in `benchmarks/latest/` (ignored). Profile separately with `node tools/benchmarks/measure.ts --profile`.

## Conditions

- date: 2026-10-09T12:37:35.285Z
- node: v24.21.0
- cpu: 13th Gen Intel(R) Core(TM) i7-13620H
- logicalCpus: 16
- memoryMiB: 31701
- warmups: 5
- repeats: 30
- shortRepeats: 100
- percentile: nearest-rank
- gzip: zlib default
- device: development machine, no pinned CPU or device profile
- Warmups are excluded. Each workload records its own count; cold processes have no warmups.
- p50/p95 use nearest rank; variance is sample variance in squared units. Byte rows are deterministic single observations.
- Corpus throughput at median elapsed time: 5953.7 documents/second.

## Results

| Workload                              | Samples | p50              | p95              | Variance | Boundary                                                                                         |
| ------------------------------------- | ------- | ---------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------ |
| static-100 prepare reused registry    | 30      | 11.662 ms        | 13.836 ms        | 1.211    | Input and registry constructed outside timing; uncached preparation.                             |
| static-100 input clone                | 100     | 0.135 ms         | 0.172 ms         | 0.000    | Cloning only.                                                                                    |
| static-1000 prepare reused registry   | 30      | 113.095 ms       | 130.156 ms       | 42.403   | Input and registry constructed outside timing; uncached preparation.                             |
| static-1000 input clone               | 100     | 1.329 ms         | 1.389 ms         | 0.007    | Cloning only.                                                                                    |
| static-10000 prepare reused registry  | 30      | 1244.365 ms      | 1272.924 ms      | 1722.728 | Input and registry constructed outside timing; uncached preparation.                             |
| static-10000 input clone              | 100     | 14.299 ms        | 16.394 ms        | 1.069    | Cloning only.                                                                                    |
| registry construction                 | 100     | 49.380 ms        | 52.847 ms        | 8.744    | Includes declaration checks and registry identity.                                               |
| static-1000 prepare new registry      | 30      | 155.313 ms       | 159.733 ms       | 5.082    | Registry construction plus uncached preparation.                                                 |
| static-1000 repeated same input       | 30      | 109.569 ms       | 112.956 ms       | 2.103    | Repeated uncached preparation; no memoization.                                                   |
| static-1000 fixture construction      | 100     | 0.648 ms         | 0.699 ms         | 0.145    | Authoring helpers and fixture creation only.                                                     |
| static-1000 end-to-end                | 30      | 160.527 ms       | 176.903 ms       | 35.423   | Fixture construction, cloning, registry construction, preparation and serialization.             |
| static-1000 publication serialization | 100     | 1.567 ms         | 1.761 ms         | 0.014    | Already prepared document.                                                                       |
| publisle static html                  | 1       | 51946.000 bytes  | 51946.000 bytes  | 0.000    | Publication HTML only.                                                                           |
| publisle static html gzip             | 1       | 2746.000 bytes   | 2746.000 bytes   | 0.000    | Default zlib compression.                                                                        |
| matched static html                   | 1       | 51927.000 bytes  | 51927.000 bytes  | 0.000    | Handwritten HTML for the same sentences; no competing compiler.                                  |
| matched static html gzip              | 1       | 2732.000 bytes   | 2732.000 bytes   | 0.000    | Default zlib compression.                                                                        |
| matched mdx source                    | 1       | 52889.000 bytes  | 52889.000 bytes  | 0.000    | Source only; MDX compilation is unsupported.                                                     |
| islands-5 prepare                     | 30      | 1.374 ms         | 1.461 ms         | 0.016    | Uncached preparation only; cloning, mounting and serialization excluded.                         |
| islands-5 html                        | 1       | 2648.000 bytes   | 2648.000 bytes   | 0.000    | HTML only; excludes host bundles and network delivery.                                           |
| repeated-100 prepare                  | 30      | 22.620 ms        | 23.811 ms        | 0.237    | Uncached preparation only; cloning, mounting and serialization excluded.                         |
| repeated-100 html                     | 1       | 51256.000 bytes  | 51256.000 bytes  | 0.000    | HTML only; excludes host bundles and network delivery.                                           |
| distinct-20 prepare                   | 30      | 3.353 ms         | 3.693 ms         | 0.012    | Uncached preparation only; cloning, mounting and serialization excluded.                         |
| distinct-20 html                      | 1       | 6406.000 bytes   | 6406.000 bytes   | 0.000    | HTML only; excludes host bundles and network delivery.                                           |
| inline-code-100kb prepare             | 30      | 2.602 ms         | 3.009 ms         | 0.063    | Uncached preparation only; cloning, mounting and serialization excluded.                         |
| inline-code-100kb html                | 1       | 100156.000 bytes | 100156.000 bytes | 0.000    | HTML only; excludes host bundles and network delivery.                                           |
| corpus-10000 prepare                  | 30      | 1679.635 ms      | 1756.027 ms      | 7441.658 | Sequential whole-corpus elapsed time; reused registry.                                           |
| contract-graph-1000 walk              | 100     | 0.105 ms         | 0.123 ms         | 0.000    | Identity and edge checks only; no schema compilation.                                            |
| static-1000 process-cold prepare      | 30      | 145.618 ms       | 162.395 ms       | 125.978  | First prepare in each fresh process; registry and fixture already constructed.                   |
| static-1000 process start-to-exit     | 30      | 361.464 ms       | 391.323 ms       | 491.635  | Parent elapsed time including process startup, imports, registry, fixture and first preparation. |

## Profiling findings

The [preparation analysis](performance-analysis.md) records the optimization and its before/after evidence. Canonical JSON byte accounting now avoids buffer allocations for small emitted fragments and retains native encoding for large strings. Declaration validation, JSON bounds and identity semantics remain unchanged.

## Limits

- Repeated prepare is uncached. Host-cache hits and incremental preparation are not implemented or measured.
- HTML sizes exclude CSS, JavaScript, island props delivered separately, requests, activation latency and reader memory.
- Repeated paragraphs compress unusually well; mixed-content size comparisons remain follow-up work.
- Inline code text is not fetched dataset delivery. Island preparation does not measure browser mounting or selective bundle loading.
- MDX compilation, other publishing toolchains and browser delivery measurements remain unsupported.
- Timing variability reflects this machine and execution order; cold processes are reported separately from warmed workloads.
