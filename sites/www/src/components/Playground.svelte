<script lang="ts">
  // One component owns editor, source views, preview, and service status so
  // their state stays trivially shared. Loaded only on /playground.
  import {
    blockLabels,
    blockTypes,
    createPlaygroundRegistry,
    DocumentEditor,
  } from "@publisle/playground";
  import BlockEditor from "@publisle/playground/BlockEditor.svelte";
  import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
  import { prepare } from "@publisle/core";
  import { compilePublication } from "@publisle/adapter-core";
  import { fetchHealth, PDF_ENABLED, type ApiHealth } from "../lib/api";

  const registry = createPlaygroundRegistry([interactiveSchematicDefinition]);

  const STARTER_MARKDOWN = `# Hello, Publisle

Edit this document on the left; the preview compiles on every change.

## Blocks

- Structured blocks keep IDs, captions, and labels
- Math stays TeX: $e^{i\\pi} + 1 = 0$
- Export Markdown or JSON at any time
`;

  let editor = $state(new DocumentEditor(undefined, registry));
  editor.importMarkdown(STARTER_MARKDOWN);

  let version = $state(0);
  editor.subscribe(() => {
    version += 1;
  });

  let mode = $state<"blocks" | "markdown" | "json">("blocks");
  let markdownText = $state(STARTER_MARKDOWN);
  let jsonText = $state("");
  let notice = $state<string | undefined>(undefined);
  let health = $state<ApiHealth | undefined>(undefined);

  const types = blockTypes();
  const labels = blockLabels();

  const compiled = $derived.by(() => {
    void version;
    try {
      const result = prepare(editor.document, { registry });
      if (!result.document) {
        return {
          html: "",
          error: result.diagnostics
            .map((item) => `${item.code}: ${item.message}`)
            .join("\n"),
        };
      }
      const artifact = compilePublication(result.document, { registry });
      return { html: artifact.html, error: "" };
    } catch (error) {
      return {
        html: "",
        error: error instanceof Error ? error.message : "Compilation failed.",
      };
    }
  });

  function addBlock(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.value === "") return;
    editor.addBlock(select.value);
    select.value = "";
    notice = undefined;
  }

  function showMarkdown(): void {
    markdownText = editor.exportMarkdown().markdown ?? "";
    mode = "markdown";
    notice = undefined;
  }

  function applyMarkdown(): void {
    const result = editor.importMarkdown(markdownText);
    notice =
      result.diagnostics.length > 0
        ? result.diagnostics
            .map((item) => `${item.code}: ${item.message}`)
            .join(" · ")
        : undefined;
    version += 1;
  }

  function showJson(): void {
    jsonText = editor.toJson();
    mode = "json";
    notice = undefined;
  }

  function applyJson(): void {
    const result = editor.fromJson(jsonText);
    notice =
      result.diagnostics.length > 0
        ? result.diagnostics
            .map((item) => `${item.code}: ${item.message}`)
            .join(" · ")
        : undefined;
    version += 1;
  }

  function reset(): void {
    editor = new DocumentEditor(undefined, registry);
    editor.importMarkdown(STARTER_MARKDOWN);
    editor.subscribe(() => {
      version += 1;
    });
    markdownText = STARTER_MARKDOWN;
    mode = "blocks";
    notice = undefined;
    version += 1;
  }

  $effect(() => {
    if (PDF_ENABLED) {
      void fetchHealth().then((result) => {
        if (result.ok) health = result.value;
      });
    }
  });
</script>

<div class="flex h-full min-h-[70vh] flex-col gap-4">
  <div class="flex flex-wrap items-center gap-2">
    <div
      class="flex overflow-hidden rounded-lg border border-line"
      role="tablist"
      aria-label="Editor mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "blocks"}
        class="px-3 py-1.5 text-sm {mode === 'blocks'
          ? 'bg-surface font-medium text-accent'
          : 'text-muted hover:text-ink'}"
        onclick={() => (mode = "blocks")}
      >
        Blocks
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "markdown"}
        class="px-3 py-1.5 text-sm {mode === 'markdown'
          ? 'bg-surface font-medium text-accent'
          : 'text-muted hover:text-ink'}"
        onclick={showMarkdown}
      >
        Markdown
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "json"}
        class="px-3 py-1.5 text-sm {mode === 'json'
          ? 'bg-surface font-medium text-accent'
          : 'text-muted hover:text-ink'}"
        onclick={showJson}
      >
        JSON
      </button>
    </div>

    {#if mode === "blocks"}
      <label class="flex items-center gap-2 text-sm text-muted">
        Add block
        <select
          class="rounded-md border border-line bg-input px-2 py-1.5 text-sm"
          onchange={addBlock}
          value=""
        >
          <option value="" disabled>Select…</option>
          {#each types as type (type)}
            <option value={type}>{labels[type] ?? type}</option>
          {/each}
        </select>
      </label>
    {:else if mode === "markdown"}
      <button
        type="button"
        class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        onclick={applyMarkdown}
      >
        Import Markdown
      </button>
    {:else}
      <button
        type="button"
        class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        onclick={applyJson}
      >
        Import JSON
      </button>
    {/if}

    <button
      type="button"
      class="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
      onclick={reset}
    >
      Reset
    </button>

    <span class="ml-auto flex items-center gap-2 text-xs text-muted">
      {#if PDF_ENABLED}
        {#if health}
          <span class="rounded-full border border-line px-2 py-0.5">
            API {health.status}
            {health.services?.pdf ? " · PDF ready" : " · PDF pending"}
          </span>
        {:else}
          <span class="rounded-full border border-line px-2 py-0.5">
            API unreachable
          </span>
        {/if}
      {:else}
        <span
          class="rounded-full border border-line px-2 py-0.5"
          title="Set PUBLIC_API_URL + PUBLIC_PDF_ENABLED when the PDF service ships"
        >
          PDF export coming soon
        </span>
      {/if}
    </span>
  </div>

  {#if notice}
    <p
      class="rounded-lg border border-warning bg-surface px-3 py-2 text-sm"
      role="status"
    >
      {notice}
    </p>
  {/if}

  <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
    <section
      aria-label="Document editor"
      class="max-h-[75vh] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface p-4"
    >
      {#if mode === "blocks"}
        {#if editor.document.blocks.length === 0}
          <p class="text-sm text-muted">No blocks. Add one above.</p>
        {:else}
          {#each editor.document.blocks as block (block.id)}
            <BlockEditor
              {block}
              onRemove={(id) => editor.removeBlock(id)}
              onMove={(id, direction) => editor.moveBlock(id, direction)}
              onUpdate={(id, data) => editor.updateBlock(id, data)}
            />
          {/each}
        {/if}
      {:else if mode === "markdown"}
        <textarea
          class="min-h-[60vh] w-full rounded-lg border border-line bg-input p-3 font-mono text-xs"
          aria-label="Markdown source"
          spellcheck="false"
          bind:value={markdownText}
        ></textarea>
      {:else}
        <textarea
          class="min-h-[60vh] w-full rounded-lg border border-line bg-input p-3 font-mono text-xs"
          aria-label="Document JSON"
          spellcheck="false"
          bind:value={jsonText}
        ></textarea>
      {/if}
    </section>

    <section
      aria-label="Compiled preview"
      class="max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-surface p-6"
    >
      <p class="mb-4 text-xs text-muted">
        Live output of <code>compilePublication</code> · islands render static
        fallbacks in this preview
      </p>
      {#if compiled.error}
        <p class="rounded-lg border border-danger bg-surface px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {compiled.error}
        </p>
      {:else}
        <div class="publisle-preview">
          {@html compiled.html}
        </div>
      {/if}
    </section>
  </div>
</div>
