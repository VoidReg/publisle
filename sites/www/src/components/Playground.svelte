<script lang="ts">
  // Playground shell: Edit/Preview view switcher, searchable block palette,
  // source views, and the compiled preview. One component owns the shared
  // editor state; loaded only on /playground.
  import { mount as svelteMount, unmount as svelteUnmount } from "svelte";
  import {
    blockCategories,
    blockDescriptions,
    blockLabels,
    blockTypes,
    createPlaygroundRegistry,
    DocumentEditor,
  } from "@publisle/playground";
  import BlockEditor from "@publisle/playground/BlockEditor.svelte";
  import MathBlockEditor from "@publisle/playground/MathBlockEditor.svelte";
  import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
  import { attachArticle } from "@publisle/adapter-astro/runtime";
  import { prepare } from "@publisle/core";
  import { compilePublication, publicationReaderManifest } from "@publisle/adapter-core";
  import { fetchHealth, PDF_ENABLED, type ApiHealth } from "../lib/api";
  import {
    playgroundExamples,
    type PlaygroundExample,
  } from "../lib/playground-examples";
  import BlockPalette from "./BlockPalette.svelte";
  import SchematicIsland from "./islands/Schematic.svelte";

  // Live island runtime for the preview: schematic islands mount the real
  // counter instead of their static fallback.
  const previewEnvironment = {
    implementations: {
      "publisle:interactive-schematic": (): Promise<unknown> =>
        Promise.resolve({ default: SchematicIsland }),
    },
    mount: (module: unknown, target: HTMLElement, props: unknown): unknown =>
      svelteMount((module as { default: typeof SchematicIsland }).default, {
        target,
        props: props as Record<string, unknown>,
      }),
    unmount: (instance: unknown): void => {
      svelteUnmount(instance as never);
    },
  };

  const registry = createPlaygroundRegistry([interactiveSchematicDefinition]);

  const STARTER_MARKDOWN = `# Hello, Publisle

Edit this document on the left; switch to Preview to see the compilation.

## Blocks

- Structured blocks keep IDs, captions, and labels
- Math stays TeX: $e^{i\\pi} + 1 = 0$
- Press Ctrl+K to add blocks from the searchable palette
`;

  let editor = $state(new DocumentEditor(undefined, registry));
  editor.importMarkdown(STARTER_MARKDOWN);

  let version = $state(0);
  editor.subscribe(() => {
    version += 1;
  });

  function initialView(): "edit" | "preview" {
    try {
      const stored = localStorage.getItem("publisle-view");
      return stored === "preview" ? "preview" : "edit";
    } catch {
      return "edit";
    }
  }

  let view = $state<"edit" | "preview">(initialView());
  let mode = $state<"blocks" | "markdown" | "json">("blocks");
  let markdownText = $state(STARTER_MARKDOWN);
  let jsonText = $state("");
  let notice = $state<string | undefined>(undefined);
  let health = $state<ApiHealth | undefined>(undefined);
  let selectedId = $state<string | undefined>(undefined);
  let paletteOpen = $state(false);
  let previewEl = $state<HTMLDivElement | null>(null);

  // Attach the island runtime to the compiled preview; re-runs (disposing the
  // previous attachment) whenever the compilation changes.
  $effect(() => {
    if (!previewEl || compiled.error || !compiled.manifest) return;
    return attachArticle(previewEl, compiled.manifest, previewEnvironment);
  });

  // $state does not deep-proxy the DocumentEditor class instance, so the
  // block list must read `version` to re-render on editor mutations.
  const blocks = $derived.by(() => {
    void version;
    return editor.document.blocks;
  });

  const types = blockTypes();
  const labels = blockLabels();
  const descriptions = blockDescriptions();
  const paletteCategories = blockCategories().map((category) => ({
    id: category.id,
    label: category.label,
    entries: category.types
      .filter((type) => types.includes(type))
      .map((type) => ({
        type,
        label: labels[type] ?? type,
        description: descriptions[type] ?? "",
      })),
  }));

  const compiled = $derived.by(() => {
    void version;
    try {
      const result = prepare(editor.document, { registry });
      if (!result.document) {
        return {
          html: "",
          warnings: result.diagnostics.length,
          error: result.diagnostics
            .map((item) => `${item.code}: ${item.message}`)
            .join("\n"),
          manifest: undefined,
        };
      }
      const artifact = compilePublication(result.document);
      return {
        html: artifact.html,
        warnings: artifact.diagnostics.length,
        error: "",
        manifest: publicationReaderManifest(artifact),
      };
    } catch (error) {
      return {
        html: "",
        warnings: 0,
        error: error instanceof Error ? error.message : "Compilation failed.",
        manifest: undefined,
      };
    }
  });

  function persistView(next: "edit" | "preview"): void {
    view = next;
    localStorage.setItem("publisle-view", next);
  }

  function addBlock(type: string): void {
    const selectedIndex = blocks.findIndex(
      (block) => block.id === selectedId,
    );
    const insertAt =
      selectedIndex >= 0 ? selectedIndex + 1 : blocks.length;
    editor.addBlock(type, insertAt);
    selectedId = editor.document.blocks[insertAt]?.id;
    view = "edit";
    notice = undefined;
  }

  function duplicate(id: string): void {
    const duplicateId = editor.duplicateBlock(id);
    if (duplicateId) selectedId = duplicateId;
    version += 1;
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

  function loadExample(example: PlaygroundExample): void {
    editor.importMarkdown(example.markdown);
    markdownText = example.markdown;
    jsonText = editor.toJson();
    selectedId = undefined;
    notice = `Loaded "${example.title}".`;
    view = "edit";
    version += 1;
  }

  function reset(): void {
    editor = new DocumentEditor(undefined, registry);
    editor.importMarkdown(STARTER_MARKDOWN);
    editor.subscribe(() => {
      version += 1;
    });
    markdownText = STARTER_MARKDOWN;
    selectedId = undefined;
    mode = "blocks";
    notice = undefined;
    persistView("edit");
    version += 1;
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      target !== null &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      paletteOpen = !paletteOpen;
      return;
    }
    if (event.key === "/" && !typing && !paletteOpen) {
      event.preventDefault();
      paletteOpen = true;
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      persistView(view === "edit" ? "preview" : "edit");
      return;
    }
    if (event.key === "Escape" && !paletteOpen && view === "preview") {
      persistView("edit");
    }
  }

  $effect(() => {
    if (PDF_ENABLED) {
      void fetchHealth().then((result) => {
        if (result.ok) health = result.value;
      });
    }
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="flex h-full min-h-[70vh] flex-col gap-4">
  <div
    class="sticky top-16 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg/95 px-2 py-2 backdrop-blur"
  >
    <div
      class="flex overflow-hidden rounded-lg border border-line"
      role="tablist"
      aria-label="Playground view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "edit"}
        class="px-4 py-1.5 text-sm {view === 'edit'
          ? 'bg-surface font-medium text-accent'
          : 'text-muted hover:text-ink'}"
        onclick={() => persistView("edit")}
      >
        Edit
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "preview"}
        class="px-4 py-1.5 text-sm {view === 'preview'
          ? 'bg-surface font-medium text-accent'
          : 'text-muted hover:text-ink'}"
        onclick={() => persistView("preview")}
      >
        Preview{#if compiled.warnings > 0}&nbsp;· {compiled.warnings}{/if}
      </button>
    </div>

    {#if view === "edit"}
      <div
        class="flex overflow-hidden rounded-lg border border-line"
        role="tablist"
        aria-label="Editor mode"
      >
        {#each ["blocks", "markdown", "json"] as entry (entry)}
          <button
            type="button"
            role="tab"
            aria-selected={mode === entry}
            class="px-3 py-1.5 text-sm capitalize {mode === entry
              ? 'bg-surface font-medium text-accent'
              : 'text-muted hover:text-ink'}"
            onclick={() => {
              if (entry === "markdown") showMarkdown();
              else if (entry === "json") showJson();
              else mode = "blocks";
            }}
          >
            {entry}
          </button>
        {/each}
      </div>
      {#if mode === "blocks"}
        <button
          type="button"
          class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90"
          onclick={() => (paletteOpen = true)}
          title="Add block (Ctrl+K)"
        >
          + Add block
        </button>
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

  {#if view === "edit" && mode === "blocks"}
    <section
      aria-label="Example documents"
      class="rounded-xl border border-line bg-surface p-3"
    >
      <p class="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
        Load an example
      </p>
      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {#each playgroundExamples as example (example.id)}
          <button
            type="button"
            class="rounded-lg border border-line bg-raised p-3 text-left transition hover:border-accent"
            onclick={() => loadExample(example)}
          >
            <span class="block text-sm font-medium">{example.title}</span>
            <span class="mt-0.5 block text-xs text-muted">
              {example.description}
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if view === "edit"}
    <section
      aria-label="Document editor"
      class="max-h-[75vh] space-y-4 overflow-y-auto rounded-xl border border-line bg-surface p-4"
    >
      {#if mode === "blocks"}
        {#if blocks.length === 0}
          <p class="text-sm text-muted">
            No blocks. Press <kbd
              class="rounded border border-line bg-raised px-1 font-mono text-xs"
            >Ctrl+K</kbd
            > or use “Add block”.
          </p>
        {:else}
          {#each blocks as block (block.id)}
            {#if block.type === "publisle:math"}
              <MathBlockEditor
                {block}
                selected={selectedId === block.id}
                onSelect={(id) => (selectedId = id)}
                onUpdate={(id, data) => editor.updateBlock(id, data)}
              />
            {:else}
              <BlockEditor
                {block}
                selected={selectedId === block.id}
                onSelect={(id) => (selectedId = id)}
                onRemove={(id) => {
                  editor.removeBlock(id);
                  if (selectedId === id) selectedId = undefined;
                }}
                onMove={(id, direction) => editor.moveBlock(id, direction)}
                onDuplicate={(id) => duplicate(id)}
                onUpdate={(id, data) => editor.updateBlock(id, data)}
              />
            {/if}
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
  {:else}
    <section
      aria-label="Compiled preview"
      class="max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-surface p-6"
    >
      <p class="mb-4 text-xs text-muted">
        Live output of <code>compilePublication</code> · interactive islands
        run for real (schematic: Clock and Reset)
      </p>
      {#if compiled.error}
        <p class="whitespace-pre-wrap rounded-lg border border-danger bg-surface px-3 py-2 font-mono text-xs">
          {compiled.error}
        </p>
      {:else}
        <div class="publisle-preview" bind:this={previewEl}>
          {@html compiled.html}
        </div>
      {/if}
    </section>
  {/if}

  <p class="hidden text-xs text-muted sm:block">
    <kbd class="rounded border border-line bg-raised px-1 font-mono">Ctrl+K</kbd>
    add block ·
    <kbd class="rounded border border-line bg-raised px-1 font-mono">Ctrl+↵</kbd>
    toggle preview ·
    <kbd class="rounded border border-line bg-raised px-1 font-mono">Esc</kbd>
    back to editor
  </p>
</div>

<BlockPalette
  open={paletteOpen}
  categories={paletteCategories}
  oninsert={addBlock}
  onclose={() => (paletteOpen = false)}
/>
