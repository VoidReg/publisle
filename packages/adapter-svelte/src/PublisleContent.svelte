<script>
  import RenderNode from "./RenderNode.svelte";
  let { plan, islands = {} } = $props();
</script>

{#each plan.nodes as node}
  <RenderNode {node} {islands} />
{/each}
