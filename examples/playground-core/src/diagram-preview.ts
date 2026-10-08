import {
  createRenderPlan,
  type DiagramRenderer,
  type RenderNode,
} from "@publisle/adapter-core";
import type { Document, PreparedDocument } from "@publisle/schema";
import { diagramKey, validateMermaidSource } from "./mermaid-config.ts";

export interface DiagramPreviewSnapshot {
  readonly revision: number;
  readonly pending: number;
  readonly errors: readonly { source: string; message: string }[];
}
type Asset = {
  readonly source: string;
  readonly url: string;
  readonly key: string;
};
type Entry = { readonly url: string; readonly bytes: number };
type Render = (source: string, id: string) => Promise<string>;

// Mermaid uses shared configuration/DOM state. Serialize across host instances too.
let renderQueue: Promise<void> = Promise.resolve();
let renderId = 0;

export function mermaidSources(document: Document): string[] {
  return document.blocks.flatMap((block) => {
    if (block.type !== "publisle:diagram") return [];
    const data = block.data as Record<string, unknown>;
    return data["engine"] === "mermaid" && typeof data["source"] === "string"
      ? [data["source"]]
      : [];
  });
}

export class DiagramPreview {
  private readonly assets = new Map<string, string>();
  private readonly cache = new Map<string, Entry>();
  private readonly activeResults = new Map<string, string>();
  private readonly failures = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private active = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private disposed = false;
  private generation = 0;
  private bytes = 0;
  private snapshot: DiagramPreviewSnapshot = {
    revision: 0,
    pending: 0,
    errors: [],
  };
  private readonly render: Render;
  private readonly limits: { entries: number; bytes: number };
  private readonly cleanup: (() => void) | undefined;

  constructor(
    assets: readonly Asset[],
    render: Render,
    limits = { entries: 100, bytes: 5 * 1024 * 1024 },
    cleanup?: () => void,
  ) {
    this.render = render;
    this.limits = limits;
    this.cleanup = cleanup;
    for (const asset of assets)
      if (asset.key === diagramKey(asset.source))
        this.assets.set(asset.source, asset.url);
  }

  /** Effects may restart during React StrictMode's development lifecycle probe. */
  start(): void {
    this.disposed = false;
  }

  readonly getSnapshot = (): DiagramPreviewSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private url(source: string): string | undefined {
    const key = diagramKey(source);
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return (
      this.assets.get(source) ?? this.activeResults.get(source) ?? entry?.url
    );
  }

  readonly renderer: DiagramRenderer = ({ source, alt }) => {
    const url = this.url(source);
    const node: RenderNode = url
      ? {
          kind: "element",
          tag: "img",
          attributes: { src: url, alt, class: "demo-mermaid-svg" },
          children: [],
        }
      : {
          kind: "element",
          tag: "pre",
          attributes: {},
          children: [{ kind: "text", value: alt || source }],
        };
    return {
      static: [node],
      print: [node],
      accessibleText: alt || "Mermaid diagram",
    };
  };

  /** Preserve authored fallbacks using Publisle's existing flow/URL handling. */
  rendererFor(document: PreparedDocument): DiagramRenderer {
    const fallbacks = new Map<string, readonly RenderNode[]>();
    for (const block of document.blocks) {
      if (block.type !== "publisle:diagram") continue;
      const data = block.data as Record<string, unknown>;
      if (
        data["engine"] !== "mermaid" ||
        typeof data["source"] !== "string" ||
        this.url(data["source"])
      )
        continue;
      const plan = createRenderPlan({ ...document, blocks: [block] });
      const figure = plan.nodes[0];
      if (figure?.kind === "element" && figure.tag === "figure")
        fallbacks.set(
          JSON.stringify([data["source"], String(data["alt"] ?? "")]),
          figure.children.filter(
            (node) => !(node.kind === "element" && node.tag === "figcaption"),
          ),
        );
    }
    return (input) => {
      const fallback = fallbacks.get(JSON.stringify([input.source, input.alt]));
      if (!this.url(input.source) && fallback)
        return { static: fallback, print: fallback, accessibleText: input.alt };
      return this.renderer(input);
    };
  }

  update(sources: readonly string[]): void {
    if (this.disposed) return;
    this.active = new Set(sources);
    for (const source of this.activeResults.keys())
      if (!this.active.has(source)) this.activeResults.delete(source);
    for (const source of this.failures.keys())
      if (!this.active.has(source)) this.failures.delete(source);
    if (this.timer) clearTimeout(this.timer);
    this.publish();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.drain();
    }, 400);
  }

  retry(): void {
    this.failures.clear();
    this.update([...this.active]);
  }

  private publish(): void {
    if (this.disposed) return;
    const pending = [...this.active].filter(
      (s) => !this.url(s) && !this.failures.has(s),
    ).length;
    const errors = [...this.failures]
      .filter(([s]) => this.active.has(s))
      .map(([source, message]) => ({ source, message }));
    // Avoid recompiling the entire mathematical article for an unchanged status.
    if (
      pending === this.snapshot.pending &&
      errors.length === this.snapshot.errors.length &&
      errors.every(
        (error, index) =>
          error.source === this.snapshot.errors[index]?.source &&
          error.message === this.snapshot.errors[index]?.message,
      )
    )
      return;
    this.snapshot = {
      revision: this.snapshot.revision + 1,
      pending,
      errors,
    };
    for (const listener of this.listeners) listener();
  }

  private remember(source: string, svg: string): void {
    // An image document does not execute SVG scripts or attach SVG DOM to the article.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    this.activeResults.set(source, url);
    const bytes = new TextEncoder().encode(url).byteLength;
    if (bytes > this.limits.bytes || this.limits.entries < 1) return;
    const key = diagramKey(source);
    const previous = this.cache.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.cache.delete(key);
    this.cache.set(key, { url, bytes });
    this.bytes += bytes;
    while (
      this.cache.size > this.limits.entries ||
      this.bytes > this.limits.bytes
    ) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.cache.get(oldest)!.bytes;
      this.cache.delete(oldest);
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    const generation = this.generation;
    try {
      for (;;) {
        if (this.disposed || this.timer || generation !== this.generation)
          break;
        const source = [...this.active].find(
          (s) => !this.url(s) && !this.failures.has(s),
        );
        if (source === undefined) break;
        const work = renderQueue.then(async () => {
          if (
            this.disposed ||
            this.timer ||
            generation !== this.generation ||
            !this.active.has(source)
          )
            return;
          try {
            validateMermaidSource(source);
            const svg = await this.render(source, `demo-mermaid-${++renderId}`);
            if (
              !this.disposed &&
              generation === this.generation &&
              this.active.has(source)
            )
              this.remember(source, svg);
          } catch (error) {
            if (
              !this.disposed &&
              generation === this.generation &&
              this.active.has(source)
            )
              this.failures.set(
                source,
                error instanceof Error
                  ? error.message
                  : "Diagram rendering failed.",
              );
          }
          if (generation === this.generation) this.publish();
        });
        renderQueue = work.catch(() => {
          /* Keep the queue usable after a failed host callback. */
        });
        await work;
      }
    } finally {
      this.running = false;
      if (!this.disposed && !this.timer && this.snapshot.pending > 0)
        void this.drain();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
    this.active.clear();
    this.activeResults.clear();
    this.cache.clear();
    this.bytes = 0;
    this.failures.clear();
    this.cleanup?.();
  }
}
