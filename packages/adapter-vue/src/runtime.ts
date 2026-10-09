import {
  defineComponent,
  h,
  shallowRef,
  onMounted,
  onBeforeUnmount,
  watch,
  createApp,
  type Component,
  type PropType,
} from "vue";
import {
  attachPublication,
  instantiatePublication,
  type PublicationArtifact,
  type PublicationEnvironment,
  type PublicationHandle,
} from "@publisle/adapter-core/publication-runtime";
export const PublisleArticle = defineComponent({
  name: "PublisleArticle",
  props: {
    publication: {
      type: Object as PropType<PublicationArtifact>,
      required: true,
    },
    instanceId: { type: String, required: true },
    implementations: {
      type: Object as PropType<PublicationEnvironment["implementations"]>,
      default: undefined,
    },
  },
  setup(props) {
    const root = shallowRef<HTMLElement>();
    let handle: PublicationHandle | undefined;
    const attach = () => {
      handle?.dispose();
      if (!root.value) return;
      handle = attachPublication(root.value, props.publication, {
        ...(props.implementations
          ? { implementations: props.implementations }
          : {}),
        mount(module, target, input) {
          const component = (module as { default: Component }).default;
          const app = createApp(component, input as Record<string, unknown>);
          app.mount(target);
          return app;
        },
        unmount(instance) {
          (instance as ReturnType<typeof createApp>).unmount();
        },
      });
    };
    onMounted(attach);
    watch(
      () => [props.publication, props.instanceId, props.implementations],
      attach,
      { flush: "post" },
    );
    onBeforeUnmount(() => handle?.dispose());
    return () =>
      h("div", {
        ref: root,
        innerHTML: instantiatePublication(props.publication, props.instanceId)
          .html,
      });
  },
});

import { createIslandController } from "@publisle/adapter-core/island-runtime";
import type { Activation, JsonValue } from "@publisle/schema";
export const PublisleIsland = defineComponent({
  name: "PublisleIsland",
  props: {
    activation: { type: String as PropType<Activation>, required: true },
    label: { type: String, required: true },
    input: { type: Object as PropType<JsonValue>, required: true },
    load: {
      type: Function as PropType<() => Promise<unknown>>,
      required: true,
    },
    exportName: { type: String, required: true },
  },
  setup(props, { slots }) {
    const scope = shallowRef<HTMLElement>();
    const root = shallowRef<HTMLElement>();
    const fallback = shallowRef<HTMLElement>();
    let controller: ReturnType<typeof createIslandController> | undefined;
    const attach = () => {
      controller?.destroy();
      if (!scope.value || !root.value || !fallback.value) return;
      controller = createIslandController({
        scope: scope.value,
        root: root.value,
        fallback: fallback.value,
        activation: props.activation,
        props: props.input,
        load: props.load,
        mount(module, target, input) {
          const component = (module as Record<string, Component>)[
            props.exportName
          ];
          if (!component)
            throw new Error(`Missing Vue island export ${props.exportName}`);
          const app = createApp(component, input as Record<string, unknown>);
          app.mount(target);
          return app;
        },
        unmount(instance) {
          (instance as ReturnType<typeof createApp>).unmount();
        },
      });
    };
    onMounted(attach);
    watch(
      () => [props.activation, props.input, props.load, props.exportName],
      attach,
      { flush: "post" },
    );
    onBeforeUnmount(() => controller?.destroy());
    return () =>
      h(
        "div",
        { ref: scope, class: "publisle-island", "aria-label": props.label },
        [
          h(
            "div",
            { ref: fallback, "data-publisle-fallback": true },
            slots["default"]?.(),
          ),
          h("div", { ref: root, hidden: true, "data-publisle-mount": true }),
        ],
      );
  },
});
