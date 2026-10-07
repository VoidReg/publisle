import type {
  Activation,
  Diagnostic,
  JsonValue,
  PreparedDocument,
  PublicationMetadata,
} from "@publisle/schema";
import type { BlockRegistry } from "@publisle/core";

export type RenderAttribute = boolean | number | string;
export type RenderNode =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "raw"; readonly value: string }
  | {
      readonly kind: "element";
      readonly tag: string;
      readonly attributes: Readonly<Record<string, RenderAttribute>>;
      readonly children: readonly RenderNode[];
    }
  | {
      readonly kind: "island";
      readonly blockId: string;
      readonly activation: Activation;
      readonly label: string;
      readonly module: string;
      readonly exportName: string;
      readonly props: JsonValue;
      readonly fallback: readonly RenderNode[];
    }
  | {
      readonly kind: "component";
      readonly module: string;
      readonly exportName: string;
      readonly props: JsonValue;
    };

export interface RenderPlan {
  readonly metadata?: PublicationMetadata;
  readonly document: PreparedDocument;
  readonly nodes: readonly RenderNode[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RendererModuleReference {
  readonly module: string;
  readonly exportName?: string;
}
export interface IslandRendererReference {
  readonly module?: string;
  readonly exportName?: string;
  readonly interactive?: RendererModuleReference;
  readonly static?: RendererModuleReference;
}
export interface AdapterCompilerOptions {
  readonly renderers?: Readonly<Record<string, IslandRendererReference>>;
  readonly rawHtml?:
    "escape" | "omit" | "trusted" | ((value: string) => string);
}
export interface AdapterTarget {
  readonly name: string;
  readonly extension: string;
  emitModule(
    plan: RenderPlan,
    context: { readonly source: string; readonly filename: string },
  ): string;
}
export interface PublisleViteOptions extends AdapterCompilerOptions {
  readonly registry: BlockRegistry;
  readonly target: AdapterTarget;
}
