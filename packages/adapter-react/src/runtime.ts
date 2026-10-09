import {
  createElement,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { createIslandController } from "@publisle/adapter-core/island-runtime";
import type { Activation, JsonValue } from "@publisle/schema";

export interface PublisleIslandProps {
  readonly activation: Activation;
  readonly label: string;
  readonly provenance?: string;
  readonly props: JsonValue;
  readonly load: () => Promise<unknown>;
  readonly exportName: string;
  readonly fallback: ReactNode;
}

export function PublisleStatic(props: {
  readonly load?: () => Promise<unknown>;
  readonly exportName: string;
  readonly props: JsonValue;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target || !props.load) return;
    let root: Root | undefined;
    let cancelled = false;
    void props.load().then((module) => {
      if (cancelled) return;
      const component = (
        module as Record<string, ComponentType<Record<string, unknown>>>
      )[props.exportName];
      if (!component) return;
      root = createRoot(target);
      root.render(
        createElement(component, props.props as Record<string, unknown>),
      );
    });
    return () => {
      cancelled = true;
      root?.unmount();
    };
  }, [props.exportName, props.load, props.props]);
  return createElement("div", { ref, "data-publisle-static": true });
}

export function PublisleIsland(props: PublisleIslandProps): ReactNode {
  const scopeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scopeRef.current || !rootRef.current || !fallbackRef.current) return;
    const controller = createIslandController({
      root: rootRef.current,
      fallback: fallbackRef.current,
      scope: scopeRef.current,
      activation: props.activation,
      props: props.props,
      load: props.load,
      mount(module, target, componentProps) {
        const component = (
          module as Record<string, ComponentType<Record<string, unknown>>>
        )[props.exportName];
        if (!component)
          throw new Error(`Missing React island export ${props.exportName}.`);
        const root = createRoot(target);
        root.render(
          createElement(component, componentProps as Record<string, unknown>),
        );
        return root;
      },
      unmount(instance) {
        (instance as Root).unmount();
      },
    });
    return () => controller.destroy();
  }, [props.activation, props.exportName, props.load, props.props]);
  return createElement(
    "div",
    {
      ref: scopeRef,
      className: "publisle-island",
      "aria-label": props.label,
      "data-publisle-contract": props.provenance,
    },
    createElement(
      "div",
      { ref: fallbackRef, "data-publisle-fallback": true },
      props.fallback,
    ),
    createElement("div", {
      ref: rootRef,
      hidden: true,
      "data-publisle-mount": true,
    }),
  );
}
