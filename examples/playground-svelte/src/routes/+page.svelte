<script lang="ts">
  import PublisleArticle from "@publisle/adapter-svelte/article";
  import { compilePublication } from "@publisle/adapter-core";
  import "@publisle/adapter-core/document.css";
  import "@publisle/adapter-core/katex.css";
  import { prepare } from "@publisle/core";
  import type { Diagnostic } from "@publisle/schema";
  import { createMermaidPreview, mermaidSources } from "@publisle/playground-core/mermaid";
  import {
    BLOCK_TYPES,
    BLOCK_LABELS,
    DocumentEditor,
    FOURIER_ARTICLE,
    FOURIER_PARTIAL_SUMS,
  } from "@publisle/playground-core";
  import BlockEditor from "$lib/BlockEditor.svelte";
  import Schematic from "$lib/Schematic.svelte";
  import "../../../playground-core/theme.css";

  const implementations = {
    "demo:interactive-scene": () => import("@publisle/example-scene/svelte"),
    "demo:fourier-partial-sum": () => import("@publisle/example-fourier/svelte"),
    "publisle:interactive-schematic": () => Promise.resolve({ default: Schematic }),
  };

  const editor = new DocumentEditor();
  const diagrams = createMermaidPreview();
  let diagramStatus = $state(diagrams.getSnapshot());
  let current = $state(editor.document);
  let diagnostics = $state<readonly Diagnostic[]>([]);
  let payloadFormatting = $state<"pretty" | "compact">("pretty");
  let markdownInput = $state<HTMLInputElement>();
  let jsonInput = $state<HTMLInputElement>();

  $effect(() => {
    return editor.subscribe(() => {
      current = editor.document;
    });
  });

  $effect(() => {
    const unsubscribe = diagrams.subscribe(() => { diagramStatus = diagrams.getSnapshot(); });
    return () => { unsubscribe(); diagrams.dispose(); };
  });
  $effect(() => { diagrams.update(mermaidSources(current)); });

  // Svelte's deep reactive proxies cannot pass through prepare's
  // structuredClone-based detachment; hand it the plain snapshot instead.
  const prepared = $derived.by(() => {
    void diagramStatus;
    return prepare($state.snapshot(current), { registry: editor.registry });
  });
  const publication = $derived.by(() => {
    if (!prepared.document) return undefined;
    return compilePublication(prepared.document, {
      diagramRenderers: { mermaid: diagrams.rendererFor(prepared.document) },
    });
  });

  function download(filename: string, content: string, type = "text/markdown") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportMarkdown(file: File) {
    const text = await file.text();
    const result = editor.importMarkdown(text);
    diagnostics = result.diagnostics;
  }

  async function handleImportJson(file: File) {
    const text = await file.text();
    const result = editor.fromJson(text);
    diagnostics = result.diagnostics;
  }

  function handleExportMarkdown() {
    const result = editor.exportMarkdown({ payloadFormatting });
    if (result.markdown) {
      download("document.md", result.markdown);
    }
    diagnostics = result.diagnostics;
  }

  function handleExportJson() {
    download("document.json", editor.toJson(), "application/json");
  }

  function handleExportArchive() {
    const result = editor.exportMarkdown({ policy: "archival" });
    if (result.markdown) download("document.archive.md", result.markdown);
    diagnostics = result.diagnostics;
  }
</script>

<svelte:head>
  <title>Publisle Playground (Svelte)</title>
</svelte:head>

<div class="playground">
  <header class="toolbar">
    <h1>Publisle Playground (Svelte)</h1>
    <div class="toolbar__actions">
      <button
        type="button"
        onclick={() => {
          editor.setDocument({ schemaVersion: 1, blocks: [] });
          diagnostics = [];
        }}
      >
        New
      </button>
      <button
        type="button"
        onclick={() => { diagnostics = editor.importMarkdown(FOURIER_ARTICLE).diagnostics; }}
      >
        Load Fourier article
      </button>
      <button
        type="button"
        onclick={() => { diagnostics = editor.importMarkdown(FOURIER_PARTIAL_SUMS).diagnostics; }}
      >
        Load Fourier model
      </button>
      <button type="button" onclick={() => markdownInput?.click()}>
        Import Markdown
      </button>
      <button type="button" onclick={handleExportMarkdown}>
        Export Markdown
      </button>
      <button type="button" onclick={handleExportArchive}>
        Export archival Markdown
      </button>
      <label>Payload JSON <select bind:value={payloadFormatting}><option value="pretty">Readable</option><option value="compact">Compact</option></select></label>
      <button type="button" onclick={() => jsonInput?.click()}>
        Import JSON
      </button>
      <button type="button" onclick={handleExportJson}>Export JSON</button>
      <input
        bind:this={markdownInput}
        type="file"
        accept=".md,.markdown"
        hidden
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleImportMarkdown(file);
          event.currentTarget.value = "";
        }}
      />
      <input
        bind:this={jsonInput}
        type="file"
        accept=".json"
        hidden
        onchange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleImportJson(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  </header>

  <div class="playground__layout">
    <aside class="palette">
      <h2>Blocks</h2>
      {#each BLOCK_TYPES as type}
        <button type="button" onclick={() => editor.addBlock(type)}>
          {BLOCK_LABELS[type]}
        </button>
      {/each}
    </aside>

    <main class="editor">
      <h2>Editor</h2>
      {#if current.blocks.length === 0}
        <p class="muted">Add a block from the palette to start.</p>
      {:else}
        {#each current.blocks as block (block.id)}
          <BlockEditor
            {block}
            onRemove={(id) => editor.removeBlock(id)}
            onMove={(id, direction) => editor.moveBlock(id, direction)}
            onUpdate={(id, data) => editor.updateBlock(id, data)}
          />
        {/each}
      {/if}
    </main>

    <aside class="preview">
      <h2>Preview</h2>
      {#if diagramStatus.pending > 0}<p role="status">Rendering {diagramStatus.pending} diagram(s)…</p>{/if}
      {#if diagramStatus.errors.length > 0}
        <div role="status">
          {#each diagramStatus.errors as error}<p>{error.message}</p>{/each}
          <button type="button" onclick={() => diagrams.retry()}>Retry diagrams</button>
        </div>
      {/if}
      {#if publication}
        <PublisleArticle {publication} instanceId="primary" {implementations} />
      {:else}
        <p class="muted">No preview available.</p>
        {#each prepared.diagnostics.slice(0, 8) as diagnostic}
          <p class="muted" data-level={diagnostic.level}>
            [{diagnostic.level}] {diagnostic.code}: {diagnostic.message}
          </p>
        {/each}
      {/if}
    </aside>
  </div>

  {#if diagnostics.length > 0}
    <footer class="diagnostics">
      <h2>Diagnostics</h2>
      <ul>
        {#each diagnostics as diagnostic}
          <li data-level={diagnostic.level}>
            [{diagnostic.level}] {diagnostic.message}
          </li>
        {/each}
      </ul>
    </footer>
  {/if}
</div>
