<script lang="ts">
  // Full editor for publisle:math blocks: MathEditor plus display-mode and
  // cross-reference label fields.
  import MathEditor from "./MathEditor.svelte";
  import type { Block } from "@publisle/schema";

  interface Props {
    block: Block;
    onUpdate: (id: Block["id"], data: unknown) => void;
    onSelect?: (id: Block["id"]) => void;
    selected?: boolean;
  }

  let { block, onUpdate, onSelect, selected = false }: Props = $props();

  const data = $derived(
    typeof block.data === "object" && block.data !== null
      ? (block.data as Record<string, unknown>)
      : {},
  );

  function update(patch: Record<string, unknown>): void {
    onUpdate(block.id, { ...data, ...patch });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section
  class="block-editor"
  class:selected
  data-block-type={block.type}
  onclick={() => onSelect?.(block.id)}
>
  <header class="block-editor__header">
    <strong>Math</strong>
  </header>
  <div class="block-editor__body">
    <MathEditor
      value={typeof data.value === "string" ? data.value : ""}
      onchange={(value) => update({ value })}
      display={data.display === true}
      ariaLabel="Math expression (LaTeX)"
    />
    <div class="math-editor__fields">
      <label class="field field--check">
        <input
          type="checkbox"
          checked={data.display === true}
          onchange={(event) =>
            update({ display: event.currentTarget.checked })}
        />
        Display mode (centered equation)
      </label>
      <label class="field">
        Label (equation number)
        <input
          type="text"
          value={typeof data.label === "string" ? data.label : ""}
          placeholder="eq:optional"
          onchange={(event) => update({ label: event.currentTarget.value })}
        />
      </label>
    </div>
  </div>
</section>
