"use client";
import type { PublicationReaderManifest } from "@publisle/adapter-core";
import { createElement, useEffect, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  attachPublication,
  type PublicationEnvironment,
} from "@publisle/adapter-core/publication-runtime";
export interface ClientAttachmentProps {
  readonly instanceId: string;
  readonly manifest: PublicationReaderManifest;
  readonly implementations: PublicationEnvironment["implementations"];
}
/** Wrap in a host client component that supplies its local implementation loaders. */
export function ClientAttachment({
  instanceId,
  manifest,
  implementations,
}: ClientAttachmentProps): null {
  useEffect(() => {
    const root = Array.from(
      document.querySelectorAll<HTMLElement>("[data-publisle-article]"),
    )
      .find((element) => element.dataset["publisleArticle"] === instanceId)
      ?.querySelector<HTMLElement>("[data-publisle-content]");
    if (!root) return;
    const handle = attachPublication(root, manifest, {
      ...(implementations ? { implementations } : {}),
      mount(module, target, props) {
        const instance = createRoot(target);
        const component = (
          module as { default: ComponentType<Record<string, unknown>> }
        ).default;
        instance.render(
          createElement(component, props as Record<string, unknown>),
        );
        return instance;
      },
      unmount(instance) {
        (instance as Root).unmount();
      },
    });
    return () => handle.dispose();
  }, [instanceId, manifest, implementations]);
  return null;
}
