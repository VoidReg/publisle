<script lang="ts">
  import "@fontsource-variable/inter";
  import "@fontsource-variable/space-grotesk";
  import "@fontsource-variable/jetbrains-mono";
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
    RESEARCH_PAPER,
    FOURIER_PARTIAL_SUMS,
    metadataAuthors,
    metadataField,
    metadataSubjects,
    withMetadataAuthors,
    withMetadataField,
    withMetadataSubjects,
    type AuthorRow,
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

  const PAPER_TEMPLATES = [
    { value: "article", label: "Standard article (PDF/UA-2, LuaLaTeX)" },
    { value: "ieee-journal", label: "IEEE journal" },
    { value: "acm-journal", label: "ACM journal (needs country data)" },
    { value: "elsevier-numeric", label: "Elsevier (numeric)" },
    { value: "springer-journal", label: "Springer journal" },
  ];
  let paperTemplate = $state("ieee-journal");
  let paperEngine = $state<"default" | "pdflatex" | "lualatex">("default");
  let compile = $state<{
    state: "idle" | "busy" | "ok" | "error";
    message?: string;
    pdfUrl?: string;
    diagnostics?: { code: string; message: string }[];
  }>({ state: "idle" });

  async function compilePdf(): Promise<void> {
    compile = { state: "busy" };
    try {
      const exported = editor.exportMarkdown();
      if (exported.markdown === undefined)
        throw new Error("Markdown export produced no document.");
      const response = await fetch("/api/compile-paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown: exported.markdown,
          template: paperTemplate,
          ...(paperEngine === "default" ? {} : { engine: paperEngine }),
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        pdfBase64?: string;
        diagnostics?: { code: string; message: string }[];
      };
      if (!response.ok || !body.ok || body.pdfBase64 === undefined)
        throw new Error(
          body.message ?? `Compile failed (${String(response.status)}).`,
        );
      const bytes = Uint8Array.from(atob(body.pdfBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      compile = { state: "ok", pdfUrl: url, diagnostics: body.diagnostics };
    } catch (cause) {
      compile = {
        state: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  const meta = $derived(
    (current.metadata ?? {}) as Record<string, unknown>,
  );

  function updateMetadata(key: string, value: string): void {
    editor.setMetadata(
      withMetadataField(meta, key, value) as typeof current.metadata,
    );
  }

  function updateSubjects(csv: string): void {
    editor.setMetadata(
      withMetadataSubjects(meta, csv) as typeof current.metadata,
    );
  }

  function updateAuthors(rows: AuthorRow[]): void {
    editor.setMetadata(
      withMetadataAuthors(meta, rows) as typeof current.metadata,
    );
  }

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
      <button type="button" onclick={() => { diagnostics = editor.importMarkdown(RESEARCH_PAPER).diagnostics; }}>
        Load research paper
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

  <details class="meta-panel">
    <summary>Document metadata</summary>
    <div class="meta-panel__grid">
      <label>
        Title
        <input
          type="text"
          value={metadataField(meta, "title")}
          onchange={(event) => updateMetadata("title", event.currentTarget.value)}
        />
      </label>
      <label>
        Language
        <input
          type="text"
          value={metadataField(meta, "language")}
          onchange={(event) => updateMetadata("language", event.currentTarget.value)}
        />
      </label>
      <label>
        Subjects (comma-separated)
        <input
          type="text"
          value={metadataSubjects(meta)}
          onchange={(event) => updateSubjects(event.currentTarget.value)}
        />
      </label>
      <label>
        Description
        <textarea
          rows="2"
          value={metadataField(meta, "description")}
          onchange={(event) => updateMetadata("description", event.currentTarget.value)}
        ></textarea>
      </label>
      <div class="meta-panel__authors">
        <span>Authors</span>
        {#each metadataAuthors(meta) as author, index (index)}
          <div class="segment">
            <input
              type="text"
              value={author.name}
              placeholder="Name"
              aria-label="Author {index + 1} name"
              onchange={(event) => {
                const rows: AuthorRow[] = metadataAuthors(meta);
                rows[index] = {
                  name: event.currentTarget.value,
                  affiliation: rows[index]?.affiliation ?? "",
                };
                updateAuthors(rows);
              }}
            />
            <input
              type="text"
              value={author.affiliation}
              placeholder="Affiliation"
              aria-label="Author {index + 1} affiliation"
              onchange={(event) => {
                const rows: AuthorRow[] = metadataAuthors(meta);
                rows[index] = {
                  name: rows[index]?.name ?? "",
                  affiliation: event.currentTarget.value,
                };
                updateAuthors(rows);
              }}
            />
            <button
              type="button"
              aria-label="Remove author {index + 1}"
              onclick={() =>
                updateAuthors(
                  metadataAuthors(meta).filter((_, position) => position !== index),
                )}
            >✕</button>
          </div>
        {/each}
        <button
          type="button"
          onclick={() =>
            updateAuthors([
              ...metadataAuthors(meta),
              { name: "New Author", affiliation: "Affiliation" },
            ])}
        >
          Add author
        </button>
      </div>
    </div>
  </details>

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
      <div class="compile-bar">
        <label>
          Theme
          <select bind:value={paperTemplate}>
            {#each PAPER_TEMPLATES as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
        <label>
          Engine
          <select bind:value={paperEngine}>
            <option value="default">Template default</option>
            <option value="pdflatex">pdfLaTeX</option>
            <option value="lualatex">LuaLaTeX (PDF/UA-2)</option>
          </select>
        </label>
        <button type="button" disabled={compile.state === "busy"} onclick={() => void compilePdf()}>
          {compile.state === "busy" ? "Compiling…" : "Compile PDF"}
        </button>
      </div>
      {#if compile.state === "ok" && compile.pdfUrl}
        <div class="compile-result" role="status">
          <a href={compile.pdfUrl} target="_blank" rel="noreferrer">Open compiled PDF</a>
          {#each compile.diagnostics ?? [] as item (item.code)}
            <p class="muted">[{item.code}] {item.message}</p>
          {/each}
        </div>
      {:else if compile.state === "error"}
        <p class="compile-error" role="alert">{compile.message}</p>
      {/if}
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
