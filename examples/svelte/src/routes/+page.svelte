<script lang="ts">
  import PublisleArticle from "@publisle/adapter-svelte/article";
  import "@publisle/adapter-core/document.css";
  import "@publisle/adapter-core/katex.css";
  import { metadata, publication } from "../content/counter.md";
  import Schematic from "$lib/Schematic.svelte";

  const implementations = {
    "demo:interactive-scene": () => import("@publisle/example-scene/svelte"),
    "publisle:interactive-schematic": () => Promise.resolve({ default: Schematic }),
  };
</script>

<svelte:head><title>{metadata?.title ?? "Publisle"}</title></svelte:head>
<nav aria-label="Breadcrumb">Documentation / Counters</nav>
<main>
  <PublisleArticle {publication} instanceId="primary" {implementations} />
  <PublisleArticle {publication} instanceId="secondary" {implementations} />
</main>
<footer>Unrelated host content</footer>
