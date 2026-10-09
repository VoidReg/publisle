# Preparation profiling and optimization

Preparation spent most of its time in declared traversal, which validates and canonicalizes the declaration for each block. Canonicalization allocated a UTF-8 buffer for every emitted punctuation, key and scalar fragment just to account for the output byte limit. Repeated validation of the shared rich-content declaration amplified that allocation cost.

The optimization counts UTF-8 bytes directly for fragments shorter than 1024 UTF-16 code units, after Unicode validation. Larger fragments use a lazily created native encoder. It preserves the canonical text, exact byte limit, structural limits, getter rejection and SHA-256 inputs. It does not cache mutable declarations or remove validation. An interleaved 200-sample comparison found that the initial JavaScript counter slowed large ASCII fragments (52000 characters: 0.096 ms to 0.151 ms), while avoiding allocations helped small fragments. Retaining native encoding for large fragments brought their isolated timings close to the original implementation. Raw observations are in `benchmarks/fragments-before-hybrid.json` and `benchmarks/fragments-after-hybrid.json`. Hashing still encodes the final canonical string normally. No public preparation options, result types or document formats changed.

## Profiling evidence

These are individual instrumented observations for 1000 paragraphs, not benchmark medians. CPU profiles also include imports and first preparation. The before CPU profile shows UTF-8 encoding among its largest sampled costs; the after profile is dominated by canonical tree processing. Exclusive phase times avoid double counting; inclusive parent times contain their child phases.

| Phase (inclusive)                | Before ms | After ms |
| -------------------------------- | --------- | -------- |
| Source canonicalization          | 21.275    | 6.563    |
| Declared traversal               | 319.351   | 110.696  |
| Reference/resource collection    | 1.912     | 1.396    |
| Prepared canonical serialization | 4.483     | 3.950    |
| Total preparation                | 404.461   | 148.440  |

Other measured phases include payload parsing, cloning/defaults, migrations, normalization, readable inspection, reference resolution, island planning and final identities. Profiles and semantic validation are timed when exercised, but the paragraph fixture does not exercise them. Garbage collection may be charged to whichever phase runs when it occurs; an isolated cloning measurement is more useful than attributing a single phase's allocation pressure to cloning itself.

The remaining largest cost is repeated declaration validation/canonicalization. A future reuse strategy must preserve changes to mutable declarations or use explicitly immutable snapshots. The isolated contract-identity graph walk does not explain this cost and does not measure schema compilation.

## Uninstrumented comparison

The final uninstrumented medians are:

| Operation                            | Before ms | After ms | Change |
| ------------------------------------ | --------- | -------- | ------ |
| static-100 prepare reused registry   | 33.816    | 11.662   | -65.5% |
| static-1000 prepare reused registry  | 317.720   | 113.095  | -64.4% |
| static-10000 prepare reused registry | 3440.320  | 1244.365 | -63.8% |
| registry construction                | 170.669   | 49.380   | -71.1% |
| corpus-10000 prepare                 | 4587.378  | 1679.635 | -63.4% |
| static-1000 end-to-end               | 491.992   | 160.527  | -67.4% |

Paragraph scaling remains roughly linear in these fixtures. Final publication serialization is effectively unchanged (1.545 ms versus 1.567 ms); the 100 KB code fixture improves from 2.958 ms to 2.602 ms. Isolated cloning varies between runs despite using the same operation; no cloning optimization is claimed.

The paired before/after measurements and their raw samples are retained in ignored `benchmarks/before/` and `benchmarks/latest/`. Initial exploratory runs remain in `benchmarks/exploratory-before/` and `benchmarks/exploratory-after/`. The initial all-JavaScript implementation and its profile remain in `benchmarks/byte-count-only/` and `benchmarks/profile-byte-count-only/`. Final CPU profiles and phase observations are in `benchmarks/profile-before/` and `benchmarks/profile-after/`.

The final pair runs sequentially without overlapping repository checks. It uses five excluded warmups, 30 preparation samples and 100 short-operation samples, with separate fresh-process measurements. Temporary Node loaders select the original and optimized core/schema sources without changing repository files; both sides use the same harness, definitions and loader mechanism. This remains a development-machine comparison without pinned CPU conditions.

The comparison tool replays saved baseline inputs with their original IDs and checks the entire preparation result and publication output. All five baseline fixtures preserve prepared output, diagnostics, identities and publication output exactly. Static HTML remains 51946 bytes versus 51927 handwritten bytes, and 2746 versus 2732 bytes compressed. The full 561-test suite also passes, including Unicode byte boundaries, invalid JSON, migrations, locked contracts, readable sidecars, resources, references and profiles. Example builds, type checking and lint pass.

## Interpretation

[The measurement report](performance.md) gives the complete operation boundaries and sample statistics. Paragraph scaling, new versus reused registries, cloning, serialization and whole-corpus throughput are reported separately. Repeated preparation is uncached and does not establish an unchanged-document fast path.

The static output result remains evidence of negligible HTML size overhead for the paragraph fixture. These measurements do not establish comparative whole-system speed, browser delivery efficiency, persistent host-cache behavior or incremental preparation. Mixed-content size fixtures, competing compilers and reader measurements remain follow-up work.
