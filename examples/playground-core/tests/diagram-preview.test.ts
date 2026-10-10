import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramPreview } from "../src/diagram-preview.ts";
import { diagramKey, validateMermaidSource } from "../src/mermaid-config.ts";
import { fromMarkdown } from "@publisle/markdown";
import { prepare } from "@publisle/core";
import { compilePublication } from "@publisle/adapter-core";
import { CORE_REGISTRY } from "../src/editor.ts";
import { readFileSync } from "node:fs";
import { defaultData } from "../src/templates.ts";
import { mermaidSources } from "../src/diagram-preview.ts";
import { MERMAID_SITE_THEME } from "../src/generated/mermaid-theme.ts";
import { MERMAID_THEME_VARIABLES } from "../src/mermaid-theme.ts";

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>';
const tick = async () => {
  await vi.advanceTimersByTimeAsync(400);
};
afterEach(() => {
  vi.useRealTimers();
});

describe("host-owned diagram previews", () => {
  it("keeps diagram colors and typography synchronized with the website CSS", () => {
    const stylesheet = readFileSync(
      new URL("../theme.css", import.meta.url),
      "utf8",
    );
    const roots = [...stylesheet.matchAll(/:root\s*\{([^}]+)\}/gu)];
    for (const [index, name] of ["light", "dark"].entries()) {
      const palette = MERMAID_SITE_THEME[name as "light" | "dark"];
      for (const [token, value] of Object.entries(palette)) {
        const cssName =
          token === "raised"
            ? "surface-raised"
            : token === "muted"
              ? "text-muted"
              : token;
        expect(roots[index]?.[1]).toContain(`--${cssName}: ${value};`);
      }
    }
    expect(
      /font-family:\s*([^;]+);/u
        .exec(roots[0]?.[1] ?? "")?.[1]
        ?.trim()
        .replace(/\s+/gu, " "),
    ).toBe(MERMAID_SITE_THEME.fontFamily);
    expect(MERMAID_THEME_VARIABLES.primaryColor).toBe(
      MERMAID_SITE_THEME.light.raised,
    );
    expect(MERMAID_THEME_VARIABLES.primaryTextColor).toBe(
      MERMAID_SITE_THEME.light.text,
    );
  });
  it("ships current SVG assets for all bundled Mermaid sources", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../src/generated/mermaid.json", import.meta.url),
        "utf8",
      ),
    ) as { source: string; key: string; file: string }[];
    const article = fromMarkdown(
      readFileSync(
        new URL("../../articles/fourier-series.md", import.meta.url),
        "utf8",
      ),
    ).document!;
    const template = defaultData("publisle:diagram") as { source: string };
    for (const source of [...mermaidSources(article), template.source]) {
      const asset = manifest.find((entry) => entry.key === diagramKey(source));
      expect(
        asset,
        "Run generate:diagrams after changing bundled sources/config",
      ).toBeDefined();
      const svg = readFileSync(
        new URL(`../src/generated/${asset!.file}`, import.meta.url),
        "utf8",
      );
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toContain("<foreignObject");
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain('width="100%"');
      expect(svg).toContain("@media(prefers-color-scheme:dark)");
      expect(svg).toContain("fill:var(--diagram-raised)");
      expect(svg).toContain(
        `--diagram-raised:${MERMAID_SITE_THEME.dark.raised}`,
      );
      expect(svg.replace(/\s+/gu, "")).toContain(
        `font-family:${MERMAID_SITE_THEME.fontFamily.replace(/\s+/gu, "")}`,
      );
    }
  });
  it("preserves authored fallbacks, captions, numbering and cross references", () => {
    const imported = fromMarkdown(
      '::::diagram{engine="mermaid" label="diagram:test" alt="A to B"}\n\n```mermaid\ngraph TD; A-->B\n```\n\n:::caption\nMy caption\n:::\n\n:::fallback\nAuthored **fallback**.\n:::\n::::\n',
    );
    const prepared = prepare(imported.document!, {
      registry: CORE_REGISTRY,
    }).document!;
    const preview = new DiagramPreview([], () => Promise.resolve(svg));
    const publication = compilePublication(prepared, {
      diagramRenderers: { mermaid: preview.rendererFor(prepared) },
    });
    expect(publication.html).toContain("Authored <strong>fallback</strong>");
    expect(publication.html).toContain("My caption");
    expect(publication.html).toContain("Diagram 1");
    expect(publication.html).toContain("reference-diagram:test");
    expect(publication.diagnostics).toEqual([]);
    expect(() =>
      validateMermaidSource('graph TD; A["An elk"]-->B'),
    ).not.toThrow();
    preview.dispose();
  });
  it("uses versioned pre-rendered assets without invoking Mermaid", async () => {
    vi.useFakeTimers();
    const render = vi.fn().mockResolvedValue(svg);
    const preview = new DiagramPreview(
      [
        {
          source: "graph TD; A-->B",
          key: diagramKey("graph TD; A-->B"),
          url: "/demo.svg",
        },
      ],
      render,
    );
    const listener = vi.fn();
    preview.subscribe(listener);
    preview.update(["graph TD; A-->B"]);
    await tick();
    expect(render).not.toHaveBeenCalled();
    expect(preview.getSnapshot().pending).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(
      preview.renderer({
        engine: "mermaid",
        source: "graph TD; A-->B",
        alt: "A to B",
      }).static,
    ).toEqual([
      {
        kind: "element",
        tag: "img",
        attributes: {
          src: "/demo.svg",
          alt: "A to B",
          class: "demo-mermaid-svg",
        },
        children: [],
      },
    ]);
    preview.dispose();
  });

  it("debounces, deduplicates, and reuses SVG with changed alt text", async () => {
    vi.useFakeTimers();
    const render = vi.fn().mockResolvedValue(svg);
    const preview = new DiagramPreview([], render);
    preview.update(["old"]);
    await vi.advanceTimersByTimeAsync(200);
    preview.update(["new", "new"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]?.[0]).toBe("new");
    preview.update(["new"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    expect(
      preview.renderer({ engine: "mermaid", source: "new", alt: "changed" })
        .static[0],
    ).toMatchObject({ attributes: { alt: "changed" } });
    preview.dispose();
  });

  it("ignores obsolete completion and serializes renders", async () => {
    vi.useFakeTimers();
    let finish: ((svg: string) => void) | undefined;
    const render = vi.fn((source: string) =>
      source === "first"
        ? new Promise<string>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(svg),
    );
    const preview = new DiagramPreview([], render);
    preview.update(["first"]);
    await tick();
    preview.update(["second"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    finish!(svg);
    await vi.advanceTimersByTimeAsync(0);
    expect(render).toHaveBeenCalledTimes(2);
    expect(
      preview.renderer({ engine: "mermaid", source: "first", alt: "" })
        .static[0],
    ).toMatchObject({ tag: "pre" });
    expect(preview.getSnapshot().pending).toBe(0);
    preview.dispose();
  });

  it("keeps failures stable until retry and cleans up subscriptions", async () => {
    vi.useFakeTimers();
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad syntax"))
      .mockResolvedValue(svg);
    const preview = new DiagramPreview([], render);
    const listener = vi.fn();
    preview.subscribe(listener);
    preview.update(["bad"]);
    await tick();
    expect(preview.getSnapshot().errors[0]?.message).toBe("bad syntax");
    preview.update(["bad"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    preview.retry();
    await tick();
    expect(preview.getSnapshot().errors).toEqual([]);
    preview.update(["other"]);
    preview.dispose();
    listener.mockClear();
    await tick();
    expect(render).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("evicts reusable entries but retains oversized active results", async () => {
    vi.useFakeTimers();
    const render = vi.fn().mockResolvedValue(svg);
    const preview = new DiagramPreview([], render, {
      entries: 1,
      bytes: 10000,
    });
    preview.update(["a", "b"]);
    await tick();
    expect(preview.getSnapshot().pending).toBe(0);
    preview.update([]);
    preview.update(["a"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(3);
    preview.dispose();
    const small = new DiagramPreview([], render, { entries: 1, bytes: 1 });
    small.update(["large"]);
    await tick();
    small.update(["large"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(4);
    small.update([]);
    small.update(["large"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(5);
    small.dispose();
  });

  it("rejects ELK and oversized inputs before importing the renderer", async () => {
    vi.useFakeTimers();
    const render = vi.fn().mockResolvedValue(svg);
    const preview = new DiagramPreview([], render);
    preview.update([
      "flowchart-elk TD; A-->B",
      "---\nconfig:\n  layout: elk\n---\ngraph TD; A-->B",
    ]);
    await tick();
    expect(render).not.toHaveBeenCalled();
    expect(preview.getSnapshot().errors).toHaveLength(2);
    expect(() => validateMermaidSource("a".repeat(50001))).toThrow("limit");
    preview.dispose();
  });

  it("rejects stale generated assets and restarts after disposal", async () => {
    vi.useFakeTimers();
    const render = vi.fn().mockResolvedValue(svg);
    const preview = new DiagramPreview(
      [{ source: "graph TD; A-->B", key: "old", url: "/stale.svg" }],
      render,
    );
    preview.dispose();
    preview.start();
    preview.update(["graph TD; A-->B"]);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    preview.dispose();
  });
});
