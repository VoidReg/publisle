<script lang="ts">
  import type Schematic from "./islands/Schematic.svelte";
  let Implementation = $state<typeof Schematic>();
  let busy = $state(false);
  let error = $state("");
  async function activate() {
    busy = true;
    error = "";
    try { Implementation = (await import("./islands/Schematic.svelte")).default; }
    catch { error = "The experiment could not load. Try again."; }
    finally { busy = false; }
  }
</script>

<section aria-label="Interactive FFT demonstration" class="rounded-xl border border-line bg-raised p-5 sm:p-6">
  <p class="text-xs font-medium tracking-wide text-accent uppercase">An explanation you can explore</p>
  <h3 class="mt-2 font-display text-2xl font-semibold">Eight samples. Three butterfly stages.</h3>
  <p class="mt-3 text-sm text-muted">Follow the same signal from time to frequency. Each step combines pairs of samples; the result is a spectrum with energy in just two bins.</p>
  {#if Implementation}
    <div class="mt-5"><Implementation payload={{source:"/fft-butterfly.json"}} accessibility={{label:"Interactive eight-point FFT butterfly"}} /></div>
  {:else}
    <img src="/fft-spectrum.svg" alt="The output spectrum has magnitude four in bins two and six, and zero in the other bins." width="760" height="360" loading="lazy" class="mt-4 w-full rounded-lg bg-white" />
    <button type="button" onclick={activate} disabled={busy} class="mt-4 rounded-lg bg-accent px-4 py-2 font-medium text-bg disabled:opacity-60">{busy ? "Loading experiment…" : "Explore the FFT butterfly"}</button>
  {/if}
  {#if error}<p role="status" class="mt-3 text-sm text-muted">{error}</p>{/if}
</section>
