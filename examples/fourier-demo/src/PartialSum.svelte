<script lang="ts">
  import { readFourierInput } from "./input.ts";
  import { polyline, sampleSeries } from "./model.ts";

  let input = $props();
  const payload = readFourierInput(input);
  let terms = $state(payload.terms);
  const rows = $derived(sampleSeries(terms, payload.samples));
  const path = $derived(polyline(rows));

  function format(value: number): string {
    if (Object.is(value, 0) || Math.abs(value) < 1e-12) return "0";
    return value.toFixed(6);
  }
</script>

<section aria-label="Square-wave partial sums">
  <div role="group" aria-label="Harmonic count">
    {#each payload.presets as preset (preset.id)}
      <button
        type="button"
        aria-pressed={preset.terms === terms}
        onclick={() => (terms = preset.terms)}
      >
        {preset.label}
      </button>
    {/each}
  </div>
  <p role="status" aria-live="polite">{terms} odd harmonics selected</p>
  <svg viewBox="0 0 320 160" role="img" aria-label="{terms} odd harmonics">
    <path d={path} fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
  <table>
    <caption>Partial-sum samples for {terms} odd harmonics</caption>
    <thead>
      <tr>
        <th scope="col">x</th>
        <th scope="col">Partial sum</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.x)}
        <tr>
          <td>{format(row.x)}</td>
          <td>{format(row.partial)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>
