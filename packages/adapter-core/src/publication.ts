import { sha256Hex } from "@publisle/core";
import type {
  Activation,
  Diagnostic,
  JsonObject,
  JsonValue,
  PreparedDocument,
  PublicationMetadata,
} from "@publisle/schema";
import { instantiateHtml, serializeNodes } from "./html.ts";
import { createIslandController } from "./island-runtime.ts";
import { createRenderPlan } from "./render-plan.ts";
import type { AdapterCompilerOptions, RenderPlan } from "./types.ts";

export const PUBLICATION_FORMAT = "publisle:publication" as const;
export const PUBLICATION_FORMAT_VERSION = 1 as const;
export const RENDERER_BUILD = "1";
export const DOCUMENT_STYLESHEET_ID = "publisle/document.css";
export const KATEX_STYLESHEET_ID = "publisle/katex.css";

export interface AssetReference {
  readonly id: string;
}

export interface ModuleReference {
  readonly id: string;
}

export interface PublishedIsland {
  readonly key: string;
  readonly implementation: string;
  readonly activation: Activation;
  readonly mode: "mount" | "hydrate";
  readonly props: JsonObject;
}

export interface PublicationArtifact {
  readonly format: typeof PUBLICATION_FORMAT;
  readonly formatVersion: typeof PUBLICATION_FORMAT_VERSION;
  readonly identity: string;
  readonly rendererBuild: string;
  readonly html: string;
  readonly styles: readonly AssetReference[];
  readonly modules: readonly ModuleReference[];
  readonly islands: readonly PublishedIsland[];
  readonly metadata?: PublicationMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

export interface PublicationCompilerOptions extends AdapterCompilerOptions {
  readonly styles?: "minimal" | "none";
}

export interface PublicationPlacement {
  readonly instanceId: string;
  readonly html: string;
}

export interface PublicationEnvironment {
  readonly implementations?: Readonly<Record<string, () => Promise<unknown>>>;
  readonly mount?: (
    module: unknown,
    target: HTMLElement,
    props: JsonValue,
    services: Readonly<Record<string, unknown>> | undefined,
  ) => unknown;
  readonly unmount?: (instance: unknown) => void;
  readonly services?: Readonly<Record<string, unknown>>;
  readonly assetBase?: string;
}

export interface PublicationHandle {
  dispose(): void;
}

function isRenderPlan(
  source: PreparedDocument | RenderPlan,
): source is RenderPlan {
  return "nodes" in source && "document" in source;
}

function withIslandRenderers(
  document: PreparedDocument,
  options: AdapterCompilerOptions,
): AdapterCompilerOptions {
  const renderers = { ...(options.renderers ?? {}) };
  for (const island of document.islands) {
    renderers[island.blockType] ??= { module: island.blockType };
  }
  return { ...options, renderers };
}

function payloadProps(props: JsonValue): JsonObject {
  if (typeof props !== "object" || props === null || Array.isArray(props))
    return {};
  const payload = (props as Record<string, JsonValue>)["payload"];
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  )
    return payload as JsonObject;
  return {};
}

function compilePlan(
  plan: RenderPlan,
  styles: "minimal" | "none",
): PublicationArtifact {
  const islands: PublishedIsland[] = [];
  const modules: ModuleReference[] = [];
  const seen = new Set<string>();
  const visit = (nodes: RenderPlan["nodes"]): void => {
    for (const node of nodes) {
      if (node.kind === "island") {
        const block = plan.document.blocks.find(
          (entry) => entry.id === node.blockId,
        );
        const implementation =
          node.implementation ?? block?.type ?? node.module;
        islands.push({
          key: node.blockId,
          implementation,
          activation: node.activation,
          mode: "mount",
          props: payloadProps(node.props),
        });
        if (!seen.has(implementation)) {
          seen.add(implementation);
          modules.push({ id: implementation });
        }
        continue;
      }
      if (node.kind === "element") visit(node.children);
    }
  };
  visit(plan.nodes);
  const html = `<div class="publisle-document" data-publisle-root>${serializeNodes(plan.nodes)}</div>`;
  const hasMath = plan.document.blocks.some(
    (block) =>
      block.type === "publisle:math" ||
      JSON.stringify(block.data).includes('"inlineMath"'),
  );
  const styleEntries =
    styles === "none"
      ? []
      : [
          { id: DOCUMENT_STYLESHEET_ID },
          ...(hasMath ? [{ id: KATEX_STYLESHEET_ID }] : []),
        ];
  const metadata = plan.metadata;
  const unsigned = {
    format: PUBLICATION_FORMAT,
    formatVersion: PUBLICATION_FORMAT_VERSION,
    rendererBuild: RENDERER_BUILD,
    html,
    styles: styleEntries,
    modules,
    islands,
    ...(metadata === undefined ? {} : { metadata }),
    diagnostics: plan.diagnostics,
  };
  const artifact: PublicationArtifact = {
    ...unsigned,
    identity: sha256Hex(JSON.stringify(unsigned)),
  };
  return artifact;
}

export function compilePublication(
  source: PreparedDocument | RenderPlan,
  options: PublicationCompilerOptions = {},
): PublicationArtifact {
  const styles = options.styles ?? "minimal";
  if (isRenderPlan(source)) return compilePlan(source, styles);
  const compilerOptions: AdapterCompilerOptions = {
    ...(options.renderers === undefined
      ? {}
      : { renderers: options.renderers }),
    ...(options.rawHtml === undefined ? {} : { rawHtml: options.rawHtml }),
    ...(options.embedProviders === undefined
      ? {}
      : { embedProviders: options.embedProviders }),
    ...(options.diagramRenderers === undefined
      ? {}
      : { diagramRenderers: options.diagramRenderers }),
  };
  return compilePlan(
    createRenderPlan(source, withIslandRenderers(source, compilerOptions)),
    styles,
  );
}

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
  artifact: PublicationArtifact,
  environment: PublicationEnvironment = {},
): PublicationHandle {
  const current = attachments.get(root);
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
    const loader = environment.implementations?.[island.implementation];
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
      pending = loader();
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
