# Square-wave partial sums

Both playgrounds load this host-owned example. React and Svelte implement the
same authored presets and sample table; native and artifact publication paths
retain the static explanation without JavaScript and in print. Keyboard buttons
select presets and a polite status announces the harmonic count. Independent
placements share implementation code and retain separate state.

The host evaluates `(4/π) Σ sin((2k−1)x)/(2k−1)` for 1–64 odd harmonics.
Samples use an odd count from 3 through 65, including −π, zero and π.
The finite sine series approaches the midpoint at jumps; Gibbs overshoot near
jumps is expected. Exact authored multiples of the binary64 π constant have
square-wave reference value zero. Nearby samples keep the appropriate sign.

[The pinned samples](fixtures/samples.json) record Python `math.sin` and
`math.fsum` results with an absolute tolerance of `1e-12`. TypeScript tests replay
those numbers and a separate Python test independently replays the formula.
Browser tests check displayed six-decimal samples and authored preset behavior
in both frameworks and delivery paths. They do not assert pixel identity or
prove scientific correctness for other models.

The declaration exposes the scalar harmonic count and preset operations.
Numerical sample evaluation remains explicitly implementation-bound. `input.ts`
and `model.ts` are reader-safe; `definition.ts` imports authoring/preparation
tooling and must stay outside reader bundles. Duplicate preset IDs, invalid
counts, unsupported fields and nonfinite sample positions are rejected.
