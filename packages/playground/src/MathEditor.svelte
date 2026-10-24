<script lang="ts">
  // LaTeX editing field: token-highlighted source (transparent textarea over a
  // colored pre), live KaTeX preview with inline errors, and a searchable
  // symbol palette. Used by the math block editor and inline math segments.
  let katex = $state<typeof import("katex").default>();
  let mathLoadError = $state("");
  $effect(() => {
    if (!value.trim() || katex) return;
    let active = true;
    void import("katex").then((module) => { if (active) katex = module.default; }).catch(() => { if (active) mathLoadError = "Math preview could not load. Reload to retry."; });
    return () => { active = false; };
  });
  import { tick } from "svelte";
  import {
    highlightMath,
    insertMathSnippet,
    MATH_PALETTE_TABS,
  } from "./math-palette.ts";

  interface Props {
    value: string;
    onchange: (value: string) => void;
    /** Render the preview in display mode (centered, larger). */
    display?: boolean;
    /** Slimmer chrome for inline-segment usage. */
    compact?: boolean;
    /** Hide the palette behind a toggle (inline usage). */
    collapsible?: boolean;
    ariaLabel?: string;
  }

  let {
    value,
    onchange,
    display = false,
    compact = false,
    collapsible = false,
    ariaLabel = "LaTeX source",
  }: Props = $props();

  let source = $state<HTMLTextAreaElement | null>(null);
  let selectionStart = $state(0);
  let selectionEnd = $state(0);
  let activeTab = $state(0);
  let paletteOpen = $state(!collapsible);

  function trackSelection(): void {
    if (!source) return;
    selectionStart = source.selectionStart;
    selectionEnd = source.selectionEnd;
  }

  function insert(latex: string): void {
    const result = insertMathSnippet(
      value,
      selectionStart,
      selectionEnd,
      latex,
    );
    onchange(result.text);
    void tick().then(() => {
      source?.focus();
      source?.setSelectionRange(result.selectionStart, result.selectionEnd);
      selectionStart = result.selectionStart;
      selectionEnd = result.selectionEnd;
    });
  }

  const rendered = $derived.by(() => {
    const trimmed = value.trim();
    if (trimmed === "" || !katex) return { html: "", error: mathLoadError };
    try {
      // Render fill-me guides as visible squares instead of KaTeX errors.
      const source = trimmed.replaceAll("□", "\\square ");
      const html = katex.renderToString(source, {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
        output: "html",
      });
      return { html, error: "" };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "KaTeX failed to render.";
      return { html: "", error: message.split("\n")[0] ?? message };
    }
  });

  const highlighted = $derived(highlightMath(value) + "\n");
  const tab = $derived(MATH_PALETTE_TABS[activeTab] ?? MATH_PALETTE_TABS[0]);
</script>

<div class="math-editor" class:compact data-display={display}>
  <div class="math-editor__preview" aria-live="polite">
    {#if rendered.error}
      <p class="math-editor__error" role="alert">{rendered.error}</p>
    {:else if rendered.html}
      {@html rendered.html}
    {:else}
      <p class="math-editor__empty">Empty expression</p>
    {/if}
  </div>

  <div class="math-editor__source">
    <pre class="math-editor__highlight" aria-hidden="true">{@html highlighted}</pre>
    <textarea
      bind:this={source}
      class="math-editor__input"
      aria-label={ariaLabel}
      spellcheck="false"
      rows={compact ? 2 : 3}
      value={value}
      oninput={(event) => {
        onchange(event.currentTarget.value);
        trackSelection();
      }}
      onselect={trackSelection}
      onclick={trackSelection}
      onkeyup={trackSelection}
    ></textarea>
  </div>

  {#if collapsible}
    <button
      type="button"
      class="math-editor__toggle"
      aria-expanded={paletteOpen}
      onclick={() => (paletteOpen = !paletteOpen)}
    >
      ∑ Symbols
    </button>
  {/if}

  {#if paletteOpen}
    <div class="math-editor__palette">
      <div class="math-editor__tabs" role="tablist" aria-label="Symbol categories">
        {#each MATH_PALETTE_TABS as tabEntry, index (tabEntry.id)}
          <button
            type="button"
            role="tab"
            aria-selected={index === activeTab}
            class="math-editor__tab"
            class:active={index === activeTab}
            onclick={() => (activeTab = index)}
          >
            {tabEntry.label}
          </button>
        {/each}
      </div>
      <div class="math-editor__snippets">
        {#each tab.snippets as snippet (snippet.latex)}
          <button
            type="button"
            class="math-editor__snippet"
            title={snippet.name}
            aria-label="Insert {snippet.name}"
            onclick={() => insert(snippet.latex)}
          >
            {snippet.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
