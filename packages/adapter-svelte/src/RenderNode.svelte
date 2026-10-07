<script>
  import { mount, unmount, untrack } from "svelte";
  import { createIslandController } from "@publisle/adapter-svelte/runtime";
  import RenderNode from "./RenderNode.svelte";

  let { node, islands = {} } = $props();
  let root = $state();
  let fallback = $state();
  let componentRoot = $state();

  const voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const voidElement = $derived(
    node.kind === "element" && voidElements.has(node.tag),
  );

  const islandActivation = $derived(
    node.kind === "island" ? node.activation : undefined,
  );
  const islandModule = $derived(node.kind === "island" ? node.module : undefined);
  const islandExport = $derived(
    node.kind === "island" ? node.exportName : "default",
  );
  const componentModule = $derived(
    node.kind === "component" ? node.module : undefined,
  );
  const componentExport = $derived(
    node.kind === "component" ? node.exportName : "default",
  );

  $effect(() => {
    const activation = islandActivation;
    const moduleId = islandModule;
    const exportName = islandExport;
    if (!activation || !moduleId || !root || !fallback) return;
    const load = untrack(() => islands[moduleId]);
    if (!load) return;
    const controller = createIslandController({
      root,
      fallback,
      activation,
      get props() {
        return untrack(() => (node.kind === "island" ? node.props : {}));
      },
      load,
      mount: (module, target, props) =>
        mount(module[exportName], { target, props }),
      unmount,
    });
    return () => controller.destroy();
  });

  $effect(() => {
    const moduleId = componentModule;
    const exportName = componentExport;
    const target = componentRoot;
    if (!moduleId || !target) return;
    const load = untrack(() => islands[moduleId]);
    if (!load) return;
    const componentProps = untrack(() =>
      node.kind === "component" ? node.props : {},
    );
    let instance;
    let cancelled = false;
    void Promise.resolve(load()).then((module) => {
      if (cancelled) return;
      const component = module[exportName];
      instance = mount(component, { target, props: componentProps });
    });
    return () => {
      cancelled = true;
      if (instance !== undefined) unmount(instance);
    };
  });
</script>

{#if node.kind === "text"}
  {node.value}
{:else if node.kind === "raw"}
  {@html node.value}
{:else if voidElement}
  <svelte:element this={node.tag} {...node.attributes} />
{:else if node.kind === "component"}
  <div bind:this={componentRoot} data-publisle-static></div>
{:else if node.kind === "element"}
  <svelte:element this={node.tag} {...node.attributes}>
    {#each node.children as child}
      <RenderNode node={child} {islands} />
    {/each}
  </svelte:element>
{:else}
  <div class="publisle-island" aria-label={node.label}>
    <div bind:this={fallback}>
      {#each node.fallback as child}
        <RenderNode node={child} {islands} />
      {/each}
    </div>
    <div bind:this={root} hidden></div>
  </div>
{/if}
