<script lang="ts">
  let props = $props();
  $effect(() => {
    void props;
  });
  let count = $state(0);
</script>

<section aria-label="Interactive schematic">
  <output>{count}</output>
  <button onclick={() => (count += 1)}>Clock</button>
  <button onclick={() => (count = 0)}>Reset</button>
</section>
