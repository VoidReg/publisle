<script lang="ts">
  // Client implementation for the publisle:interactive-schematic island
  // (demo clocked counter). Mounted by the publication runtime when a host
  // supplies this module under the block type key.
  let props = $props();
  $effect(() => {
    void props;
  });
  let count = $state(0);
</script>

<section class="publisle-schematic" aria-label="Interactive schematic">
  <output aria-label="Count">{count}</output>
  <div class="publisle-schematic__controls">
    <button type="button" onclick={() => (count += 1)}>Clock</button>
    <button type="button" onclick={() => (count = 0)}>Reset</button>
  </div>
</section>
