<script lang="ts">
  import PublisleArticle from "@publisle/adapter-svelte/article";
  import { compilePublication } from "@publisle/adapter-core";
  import "@publisle/adapter-core/document.css";
  import { prepare } from "@publisle/core";
  import type { Diagnostic } from "@publisle/schema";
  import {
    BLOCK_TYPES,
    BLOCK_LABELS,
    DocumentEditor,
  } from "@publisle/playground-core";
  import BlockEditor from "$lib/BlockEditor.svelte";
  import Schematic from "$lib/Schematic.svelte";
  import "../../../playground-core/theme.css";

  const implementations = {
    "publisle:interactive-schematic": () => Promise.resolve({ default: Schematic }),
  };

  const editor = new DocumentEditor();
  let current = $state(editor.document);
  let diagnostics = $state<readonly Diagnostic[]>([]);
  let markdownInput = $state<HTMLInputElement>();
  let jsonInput = $state<HTMLInputElement>();

  $effect(() => {
    return editor.subscribe(() => {
      current = editor.document;
    });
  });

  const publication = $derived.by(() => {
    const prepared = prepare(current, { registry: editor.registry });
    if (!prepared.document) return undefined;
    return compilePublication(prepared.document);
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
    const result = editor.exportMarkdown();
    if (result.markdown) {
      download("document.md", result.markdown);
    }
    diagnostics = result.diagnostics;
  }

  function handleExportJson() {
    download("document.json", editor.toJson(), "application/json");
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
      <button type="button" onclick={() => markdownInput?.click()}>
        Import Markdown
      </button>
      <button type="button" onclick={handleExportMarkdown}>
        Export Markdown
      </button>
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
      {#if publication}
        <PublisleArticle {publication} instanceId="primary" {implementations} />
      {:else}
        <p class="muted">No preview available.</p>
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
