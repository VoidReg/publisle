<script lang="ts">
  import {
    attachPublication,
    instantiatePublication,
    type PublicationArtifact,
    type PublicationEnvironment,
  } from "@publisle/adapter-core";
  import { mount as mountComponent, unmount } from "svelte";
  import type { JsonValue } from "@publisle/schema";

  interface Props {
    readonly publication: PublicationArtifact;
    readonly instanceId: string;
    readonly implementations?: PublicationEnvironment["implementations"];
    readonly services?: PublicationEnvironment["services"];
  }

  let {
    publication,
    instanceId,
    implementations = {},
    services,
  }: Props = $props();
  let root: HTMLDivElement | undefined = $state();
  let applied = "";
  const placement = $derived(instantiatePublication(publication, instanceId));

  $effect(() => {
    const element = root;
    const nextHtml = placement.html;
    const nextPublication = publication;
    const nextInstance = instanceId;
    const loaders = implementations;
    const hostServices = services;
    if (!element) return;
    const key = `${nextPublication.identity}:${nextInstance}`;
    if (applied !== key) {
      if (
        applied !== "" ||
        element.querySelector("[data-publisle-root]") === null
      ) {
        element.innerHTML = nextHtml;
      }
      applied = key;
    }
    const handle = attachPublication(element, nextPublication, {
      implementations: loaders,
      ...(hostServices === undefined ? {} : { services: hostServices }),
      mount(module, target, props: JsonValue, hostServices) {
        const record = module as { default?: unknown };
        const component = record.default ?? module;
        const componentProps =
          hostServices === undefined
            ? (props as Record<string, unknown>)
            : {
                ...(props as Record<string, unknown>),
                services: hostServices,
              };
        return mountComponent(component as never, {
          target,
          props: componentProps,
        });
      },
      unmount(instance) {
        unmount(instance as never);
      },
    });
    return () => handle.dispose();
  });
</script>

<div bind:this={root}>{@html placement.html}</div>
