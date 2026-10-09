import { sha256Hex } from "@publisle/core";
import { canonicalizeJson } from "@publisle/schema";
import type {
  Activation,
  Diagnostic,
  JsonValue,
  PreparedDocument,
  PublicationMetadata,
  BlockId,
} from "@publisle/schema";
import { serializeNodes } from "./html.ts";
export {
  instantiatePublication,
  collectPublicationAssets,
  publicationAssetUrl,
  attachPublication,
} from "./publication-runtime.ts";
import { createRenderPlan } from "./render-plan.ts";
import type { AdapterCompilerOptions, RenderPlan } from "./types.ts";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

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
  readonly props: JsonValue;
}

export interface PublicationArtifact {
  readonly provenance?: {
    readonly sourceIdentity: string | null;
    readonly semanticIdentity: string;
    readonly contracts: readonly import("@publisle/schema").ContractDependency[];
    readonly resources: import("@publisle/schema").ResourcePlan;
    readonly configuration: JsonValue;
    readonly reproducible: boolean;
    readonly seed?: JsonValue;
    readonly limitation?: string;
  };
  readonly diagnosticIdentity?: string;
  readonly compatibility?: {
    readonly islandInputVersion: 1;
    readonly staticFidelity: "supported" | "fallback" | "unsupported";
  };
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
  /** Host pins for otherwise opaque renderer/compiler configuration. Never infer function source. */
  readonly build?: {
    readonly configuration: JsonValue;
    readonly reproducible: boolean;
    readonly seed?: JsonValue;
  };
  readonly styles?: "minimal" | "none";
}

export interface PublicationPlacement {
  readonly instanceId: string;
  readonly html: string;
}

/** Minimal browser attachment data; excludes HTML, source AST, resources and diagnostics. */
export type PublicationReaderManifest = Pick<
  PublicationArtifact,
  "format" | "formatVersion" | "identity" | "compatibility" | "islands"
>;
export function publicationReaderManifest(
  artifact: PublicationArtifact,
): PublicationReaderManifest {
  return {
    format: artifact.format,
    formatVersion: artifact.formatVersion,
    identity: artifact.identity,
    ...(artifact.compatibility === undefined
      ? {}
      : { compatibility: artifact.compatibility }),
    islands: artifact.islands,
  };
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

function compilePlan(
  plan: RenderPlan,
  styles: "minimal" | "none",
  build?: PublicationCompilerOptions["build"],
  rawHtmlPlacement: "reject" | "preserve" = "reject",
): PublicationArtifact {
  const islands: PublishedIsland[] = [];
  const diagnostics = [...plan.diagnostics];
  let fidelity: "supported" | "fallback" | "unsupported" = "supported";
  const substantive = (nodes: RenderPlan["nodes"]): boolean =>
    nodes.some((node) => {
      if (node.kind === "text") return node.value.trim().length > 0;
      if (node.kind === "raw")
        return (
          node.value.replace(/<[^>]*>/gu, "").trim().length > 0 ||
          /<(?:img|svg|video|audio)\b/iu.test(node.value)
        );
      if (node.kind === "element")
        return (
          ["img", "svg", "video", "audio", "iframe", "canvas"].includes(
            node.tag,
          ) || substantive(node.children)
        );
      return node.kind === "component"
        ? substantive(node.artifact ?? [])
        : substantive(node.fallback);
    });
  const lower = (nodes: RenderPlan["nodes"]): RenderPlan["nodes"] =>
    nodes.flatMap((node) => {
      if (
        node.kind === "raw" &&
        /\b(?:id|for|headers|list|form|href|aria-labelledby|aria-describedby|aria-controls|aria-owns|aria-flowto|aria-activedescendant|aria-details|aria-errormessage)\s*=/iu.test(
          node.value,
        )
      ) {
        diagnostics.push({
          level: rawHtmlPlacement === "reject" ? "error" : "warning",
          code: "raw-html-placement-unscoped",
          message:
            "Authored trusted HTML IDs/references cannot be generically namespaced. Host must reject it or explicitly preserve it with placement restrictions.",
        });
        if (rawHtmlPlacement === "reject") {
          fidelity = "unsupported";
          return [];
        }
      }
      if (node.kind === "component") {
        const replacement = node.artifact ?? [];
        const supported = substantive(replacement);
        if (!supported) fidelity = "unsupported";
        else if (fidelity !== "unsupported") fidelity = "fallback";
        diagnostics.push({
          level: supported ? "warning" : "error",
          code: supported
            ? "artifact-component-lowered"
            : "unsupported-artifact-component",
          message: supported
            ? "Artifact uses approved static lowering/authored fallback; native component fidelity is not implied."
            : "Framework component has no static lowering or substantive authored fallback.",
          ...(node.blockId === undefined
            ? {}
            : { blockId: node.blockId as BlockId }),
        });
        return lower(replacement);
      }
      if (node.kind === "element")
        return [{ ...node, children: lower(node.children) }];
      if (node.kind === "island")
        return [{ ...node, fallback: lower(node.fallback) }];
      return [node];
    });
  const nodes = lower(plan.nodes);
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
          props: node.props,
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
  visit(nodes);
  const metadata = plan.metadata;
  const language = metadata?.language;
  const direction = metadata?.direction;
  const root = [
    'class="publisle-document"',
    "data-publisle-root",
    ...(typeof language === "string" && language
      ? [`lang="${escapeAttribute(language)}"`]
      : []),
    ...(direction === "ltr" || direction === "rtl" || direction === "auto"
      ? [`dir="${direction}"`]
      : []),
  ].join(" ");
  const html = `<div ${root}>${serializeNodes(nodes)}</div>`;
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
  const unsigned = {
    format: PUBLICATION_FORMAT,
    formatVersion: PUBLICATION_FORMAT_VERSION,
    rendererBuild: RENDERER_BUILD,
    html,
    styles: styleEntries,
    modules,
    islands,
    ...(metadata === undefined ? {} : { metadata }),
    compatibility: { islandInputVersion: 1 as const, staticFidelity: fidelity },
    provenance: {
      sourceIdentity: plan.document.sourceIdentity ?? null,
      semanticIdentity:
        plan.document.semanticIdentity ?? plan.document.cacheIdentity,
      contracts: plan.document.dependencies ?? [],
      resources: plan.document.resources,
      configuration: build?.configuration ?? {
        styles,
        rendererBuild: RENDERER_BUILD,
      },
      reproducible: build?.reproducible ?? false,
      ...(build?.seed === undefined ? {} : { seed: build.seed }),
      ...(build === undefined
        ? {
            limitation:
              "Host compiler/renderer configuration and nondeterministic inputs have not been pinned. No byte-reproduction claim.",
          }
        : {}),
    },
  };
  const artifact: PublicationArtifact = {
    ...unsigned,
    diagnostics,
    diagnosticIdentity: sha256Hex(canonicalizeJson(diagnostics)),
    identity: sha256Hex(canonicalizeJson(unsigned)),
  };
  return artifact;
}

export function compilePublication(
  source: PreparedDocument | RenderPlan,
  options: PublicationCompilerOptions = {},
): PublicationArtifact {
  const styles = options.styles ?? "minimal";
  if (isRenderPlan(source))
    return compilePlan(source, styles, options.build, options.rawHtmlPlacement);
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
    options.build,
    options.rawHtmlPlacement,
  );
}
