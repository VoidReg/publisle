<script lang="ts">
  import { mountScene } from "./runtime.ts";
  import type { ScenePayload } from "./definition.ts";
  let payload: ScenePayload = $props();
  let host: HTMLDivElement;
  $effect(() => mountScene(host, payload));
</script>

<div bind:this={host}></div>
