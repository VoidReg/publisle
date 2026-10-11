<script lang="ts">
  import { onDestroy } from "svelte";
  type Result = { url: string; meta: { title?: string }; plain_excerpt: string };
  type SearchIndex = { search: (query: string) => Promise<{ results: { data: () => Promise<Result> }[] }> };
  let query = $state("");
  let results = $state<Result[]>([]);
  let status = $state("");
  let request = 0;
  let timer: ReturnType<typeof setTimeout>;
  let index: Promise<SearchIndex> | undefined;

  onDestroy(() => { clearTimeout(timer); request += 1; });

  function search(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    clearTimeout(timer);
    const current = ++request;
    const term = query.trim();
    results = [];
    status = term ? "Searching…" : "";
    if (!term) return;
    timer = setTimeout(async () => {
      try {
        const bundle = "/pagefind/pagefind.js";
        index ??= import(/* @vite-ignore */ bundle) as Promise<SearchIndex>;
        const found = await (await index).search(term);
        const pages = await Promise.all(found.results.slice(0, 8).map((result) => result.data()));
        if (current !== request) return;
        results = pages;
        status = found.results.length ? `${found.results.length} pages found. Showing up to 8.` : "No matching pages. Try another term.";
      } catch {
        if (current === request) status = "Search is unavailable. Browse the documentation links below.";
        index = undefined;
      }
    }, 180);
  }
</script>

<section aria-label="Documentation search" class="my-6 rounded-xl border border-line bg-surface p-4">
  <label for="docs-search" class="block text-sm font-medium">Search all documentation</label>
  <input id="docs-search" type="search" placeholder="Try “Markdown”, “accessibility”, or “Astro”" class="mt-2 w-full min-w-0 rounded-lg border border-line bg-input px-3 py-2 text-sm" bind:value={query} oninput={search} aria-describedby="docs-search-status" />
  <p id="docs-search-status" class="mt-2 text-xs text-muted" role="status">{status}</p>
  {#if results.length}
    <ul class="mt-3 space-y-2">
      {#each results as result (result.url)}
        <li>
          <a href={result.url} class="block rounded-lg border border-line p-3 hover:border-accent">
            <span class="font-medium text-accent underline underline-offset-2">{result.meta.title ?? result.url}</span>
            <span class="mt-1 block text-sm text-muted">{result.plain_excerpt}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  <noscript><p class="text-sm text-muted">Search needs JavaScript. Browse the guides and standards below.</p></noscript>
</section>
