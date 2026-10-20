<script lang="ts">
  // Client implementation for the publisle:interactive-schematic island.
  // A payload pointing at a { points, signal } resource runs as an FFT
  // butterfly: every "Step stage" applies one Cooley–Tukey stage to the
  // bit-reversed input. Any other payload keeps the demo clocked counter.
  interface IslandProps {
    payload?: { source?: string };
    accessibility?: { label?: string };
  }

  let { payload, accessibility }: IslandProps = $props();

  interface Butterfly {
    points: number;
    signal: number[];
  }

  interface Complex {
    re: number;
    im: number;
  }

  let butterfly = $state<Butterfly | undefined>(undefined);
  let stage = $state(0);
  let count = $state(0);

  $effect(() => {
    const source = payload?.source;
    if (typeof source !== "string") return;
    const controller = new AbortController();
    fetch(source, { signal: controller.signal })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(String(response.status))),
      )
      .then((data: unknown) => {
        const points = (data as Butterfly | null)?.points;
        const signal = (data as Butterfly | null)?.signal;
        if (
          typeof points !== "number" ||
          !Number.isInteger(points) ||
          points < 2 ||
          points > 64 ||
          (points & (points - 1)) !== 0 ||
          !Array.isArray(signal) ||
          signal.length !== points ||
          signal.some((value) => typeof value !== "number")
        )
          return;
        butterfly = { points, signal };
        stage = 0;
      })
      .catch(() => undefined);
    return () => controller.abort();
  });

  const totalStages = $derived(butterfly ? Math.log2(butterfly.points) : 0);

  function bitReverse(value: number, bits: number): number {
    let result = 0;
    for (let bit = 0; bit < bits; bit += 1)
      result = (result << 1) | ((value >>> bit) & 1);
    return result;
  }

  // Complex values after `stage` butterfly stages; stage 0 is the bit-reversed
  // input, stage `totalStages` is the DFT.
  const values = $derived.by<Complex[]>(() => {
    if (!butterfly) return [];
    const points = butterfly.points;
    const bits = Math.log2(points);
    let re: number[] = butterfly.signal.map(
      (_, index) => butterfly!.signal[bitReverse(index, bits)]!,
    );
    let im: number[] = new Array(points).fill(0) as number[];
    for (let level = 1; level <= stage; level += 1) {
      const size = 1 << level;
      const half = size / 2;
      const nextRe = re.slice();
      const nextIm = im.slice();
      for (let start = 0; start < points; start += size) {
        for (let offset = 0; offset < half; offset += 1) {
          const angle = (-2 * Math.PI * offset) / size;
          const twiddleRe = Math.cos(angle);
          const twiddleIm = Math.sin(angle);
          const even = start + offset;
          const odd = even + half;
          const productRe = re[odd]! * twiddleRe - im[odd]! * twiddleIm;
          const productIm = re[odd]! * twiddleIm + im[odd]! * twiddleRe;
          nextRe[even] = re[even]! + productRe;
          nextIm[even] = im[even]! + productIm;
          nextRe[odd] = re[even]! - productRe;
          nextIm[odd] = im[even]! - productIm;
        }
      }
      re = nextRe;
      im = nextIm;
    }
    return re.map((value, index) => ({ re: value, im: im[index]! }));
  });

  const twiddles = $derived.by<string[]>(() => {
    if (!butterfly || stage === 0) return [];
    const size = 1 << stage;
    const half = size / 2;
    return Array.from(
      { length: half },
      (_, exponent) => `W${size}^${exponent}`,
    );
  });

  function format(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return Object.is(rounded, -0) ? "0" : String(rounded);
  }

  function component(complex: Complex): string {
    const imaginary = `${format(complex.im)}i`;
    return complex.im < 0
      ? `${format(complex.re)} − ${imaginary.slice(1)}`
      : `${format(complex.re)} + ${imaginary}`;
  }

  function step(): void {
    if (stage < totalStages) stage += 1;
  }

  function run(): void {
    stage = totalStages;
  }

  function reset(): void {
    stage = 0;
    count = 0;
  }
</script>

{#if butterfly}
  <section
    class="publisle-schematic publisle-fft"
    aria-label={accessibility?.label ?? "Interactive FFT butterfly"}
  >
    <header class="publisle-fft__header">
      <span class="publisle-fft__stage">
        {stage === 0
          ? "Input, bit-reversed"
          : stage === totalStages
            ? "Output spectrum (DFT)"
            : `After butterfly stage ${stage} of ${totalStages}`}
      </span>
      {#if twiddles.length}
        <span class="publisle-fft__twiddles">
          Twiddles {twiddles.join("  ")}
        </span>
      {/if}
    </header>
    <ol class="publisle-fft__grid" aria-live="polite">
      {#each values as value, index (index)}
        <li class="publisle-fft__cell">
          <span class="publisle-fft__index"
            >{stage === 0 ? "x" : "X"}[{index}]</span
          >
          <span class="publisle-fft__value">{component(value)}</span>
        </li>
      {/each}
    </ol>
    <div class="publisle-schematic__controls">
      <button type="button" onclick={reset}>Reset</button>
      <button type="button" onclick={step} disabled={stage >= totalStages}>
        Step stage
      </button>
      <button type="button" onclick={run} disabled={stage >= totalStages}>
        Run all {totalStages} stages
      </button>
    </div>
  </section>
{:else}
  <section class="publisle-schematic" aria-label="Interactive schematic">
    <output aria-label="Count">{count}</output>
    <div class="publisle-schematic__controls">
      <button type="button" onclick={() => (count += 1)}>Clock</button>
      <button type="button" onclick={reset}>Reset</button>
    </div>
  </section>
{/if}
