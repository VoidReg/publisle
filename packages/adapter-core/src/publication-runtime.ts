import { instantiateHtml } from "./html.ts";
import { createIslandController } from "./island-runtime.ts";
import type { JsonValue } from "@publisle/schema";
import type {
  PublicationArtifact,
  PublicationReaderManifest,
  PublicationPlacement,
  AssetReference,
  ModuleReference,
  PublicationHandle,
  PublicationEnvironment,
} from "./publication.ts";
export type {
  PublicationArtifact,
  PublicationEnvironment,
  PublicationHandle,
  PublicationPlacement,
} from "./publication.ts";
const PUBLICATION_FORMAT = "publisle:publication";
const PUBLICATION_FORMAT_VERSION = 1;

export function instantiatePublication(
  artifact: PublicationArtifact,
  instanceId: string,
): PublicationPlacement {
  return {
    instanceId,
    html: instantiateHtml(artifact.html, instanceId),
  };
}

export function collectPublicationAssets(
  artifacts: readonly PublicationArtifact[],
): {
  readonly styles: readonly AssetReference[];
  readonly modules: readonly ModuleReference[];
} {
  const styles = new Map<string, AssetReference>();
  const modules = new Map<string, ModuleReference>();
  for (const artifact of artifacts) {
    for (const style of artifact.styles) styles.set(style.id, style);
    for (const module of artifact.modules) modules.set(module.id, module);
  }
  return {
    styles: [...styles.values()],
    modules: [...modules.values()],
  };
}

export function publicationAssetUrl(id: string, assetBase = ""): string {
  if (assetBase === "") return id;
  return `${assetBase.endsWith("/") ? assetBase : `${assetBase}/`}${id}`;
}

interface Attachment {
  readonly key: string;
  readonly handle: PublicationHandle;
}

const attachments = new WeakMap<HTMLElement, Attachment>();

export function attachPublication(
  root: HTMLElement,
  artifact: PublicationReaderManifest,
  environment: PublicationEnvironment = {},
): PublicationHandle {
  const current = attachments.get(root);
  if (
    artifact.format !== PUBLICATION_FORMAT ||
    artifact.formatVersion !== PUBLICATION_FORMAT_VERSION ||
    artifact.compatibility?.islandInputVersion !== 1
  ) {
    current?.handle.dispose();
    attachments.delete(root);
    root.setAttribute("data-publisle-incompatible", "artifact-or-island-input");
    return {
      dispose() {
        return undefined;
      },
    };
  }
  if (current?.key === artifact.identity) return current.handle;
  current?.handle.dispose();
  if (artifact.islands.length === 0) {
    const handle = {
      dispose() {
        return undefined;
      },
    };
    return handle;
  }
  const loads = new Map<string, Promise<unknown>>();
  const controllers: { destroy(): void }[] = [];
  for (const section of root.querySelectorAll<HTMLElement>(
    "[data-publisle-island]",
  )) {
    const key = section.getAttribute("data-publisle-island");
    const island = artifact.islands.find((entry) => entry.key === key);
    if (!island) continue;
    if (
      typeof island.props !== "object" ||
      island.props === null ||
      Array.isArray(island.props) ||
      (island.props as Record<string, JsonValue>)["inputVersion"] !== 1
    ) {
      section.setAttribute("data-publisle-incompatible", "island-input");
      continue;
    }
    if (island.mode === "hydrate") {
      section.setAttribute("data-publisle-unsupported-mode", "hydrate");
      continue;
    }
    const fallback = section.querySelector<HTMLElement>(
      "[data-publisle-fallback]",
    );
    const mountTarget = section.querySelector<HTMLElement>(
      "[data-publisle-mount]",
    );
    const mappings = environment.implementations;
    const loader =
      mappings && Object.hasOwn(mappings, island.implementation)
        ? mappings[island.implementation]
        : undefined;
    if (
      !fallback ||
      !mountTarget ||
      !loader ||
      !environment.mount ||
      !environment.unmount
    ) {
      section.setAttribute("data-publisle-missing", island.implementation);
      continue;
    }
    let pending = loads.get(island.implementation);
    if (!pending) {
      pending = Promise.resolve().then(loader);
      void pending.catch(() => undefined); // Preserve rejection for activation without an eager unhandled rejection.
      loads.set(island.implementation, pending);
    }
    const shared = pending;
    controllers.push(
      createIslandController({
        root: mountTarget,
        fallback,
        scope: section,
        activation: island.activation,
        props: island.props,
        load: () => shared,
        mount: (module, target, props) =>
          environment.mount?.(module, target, props, environment.services),
        unmount: (instance) => environment.unmount?.(instance),
      }),
    );
  }
  let disposed = false;
  const handle: PublicationHandle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of controllers) controller.destroy();
      if (attachments.get(root)?.handle === handle) attachments.delete(root);
    },
  };
  attachments.set(root, { key: artifact.identity, handle });
  return handle;
}
