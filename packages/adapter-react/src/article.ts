import {
  createElement,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  attachPublication,
  instantiatePublication,
  type PublicationArtifact,
  type PublicationEnvironment,
} from "@publisle/adapter-core";
import type { JsonValue } from "@publisle/schema";

export interface PublisleArticleProps {
  readonly publication: PublicationArtifact;
  readonly instanceId: string;
  readonly implementations?: PublicationEnvironment["implementations"];
  readonly services?: PublicationEnvironment["services"];
}

function mountComponent(
  module: unknown,
  target: HTMLElement,
  props: JsonValue,
  services: Readonly<Record<string, unknown>> | undefined,
): Root {
  const record = module as {
    default?: ComponentType<Record<string, unknown>>;
  };
  const component =
    record.default ?? (module as ComponentType<Record<string, unknown>>);
  const root = createRoot(target);
  const componentProps =
    services === undefined
      ? (props as Record<string, unknown>)
      : { ...(props as Record<string, unknown>), services };
  root.render(createElement(component, componentProps));
  return root;
}

export function PublisleArticle(props: PublisleArticleProps): ReactNode {
  const placement = instantiatePublication(props.publication, props.instanceId);
  const ref = useRef<HTMLDivElement>(null);
  const { publication, instanceId, implementations, services } = props;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handle = attachPublication(element, publication, {
      ...(implementations === undefined ? {} : { implementations }),
      ...(services === undefined ? {} : { services }),
      mount: mountComponent,
      unmount(instance) {
        (instance as Root).unmount();
      },
    });
    return () => handle.dispose();
  }, [publication, instanceId, implementations, services]);
  return createElement("div", {
    ref,
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: placement.html },
  });
}
