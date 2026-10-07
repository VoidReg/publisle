import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { heading, paragraph } from "@publisle/blocks-core";
import {
  interactiveSchematicDefinition,
  interactiveSchematic,
} from "@publisle/blocks-technical";
import { createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createBlock, document } from "@publisle/schema";
import {
  DOCUMENT_STYLESHEET_ID,
  attachPublication,
  compilePublication,
  instantiatePublication,
} from "../src/index.ts";

class ElementStub {
  hidden = false;
  parent: ElementStub | null = null;
  readonly children: ElementStub[] = [];
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, (event: Event) => void>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  append(child: ElementStub): void {
    child.parent = this;
    this.children.push(child);
  }
  querySelector(selector: string): ElementStub | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): ElementStub[] {
    const name = /^\[([^\]]+)\]$/u.exec(selector)?.[1];
    const found: ElementStub[] = [];
    const walk = (node: ElementStub): void => {
      if (name && node.attrs.has(name)) found.push(node);
      for (const child of node.children) walk(child);
    };
    for (const child of this.children) walk(child);
    return found;
  }
  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  closest(selector: string): ElementStub | null {
    return closestMatch(this, selector);
  }
}

function closestMatch(
  start: ElementStub | null,
  selector: string,
): ElementStub | null {
  const name = /^\[([^\]]+)\]$/u.exec(selector)?.[1];
  let current = start;
  while (current) {
    if (name && current.attrs.has(name)) return current;
    current = current.parent;
  }
  return null;
}

function islandTree(key: string): ElementStub {
  const section = new ElementStub();
  section.setAttribute("data-publisle-island", key);
  const fallback = new ElementStub();
  fallback.setAttribute("data-publisle-fallback", "");
  const mount = new ElementStub();
  mount.setAttribute("data-publisle-mount", "");
  mount.hidden = true;
  const button = new ElementStub();
  button.setAttribute("data-publisle-activate", "");
  section.append(fallback);
  section.append(mount);
  section.append(button);
  return section;
}

describe("publication artifact", () => {
  const registry = createRegistry([
    ...coreBlockDefinitions,
    interactiveSchematicDefinition,
  ]);

  function preparedArticle() {
    const input = document({
      metadata: { title: "Counter guide" },
      blocks: [
        heading({
          level: 2,
          content: [{ type: "text", value: "Clocked counter" }],
        }),
        paragraph({
          content: [
            { type: "text", value: "See the note." },
            { type: "footnoteReference", identifier: "note" },
          ],
        }),
        createBlock({
          type: "publisle:footnote",
          schemaVersion: 1,
          data: {
            identifier: "note",
            children: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "A note." }],
              },
            ],
          },
        }),
        interactiveSchematic({
          activation: "interaction",
          content: {
            title: [{ type: "text", value: "Clocked counter" }],
            description: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    value: "Observe the output on each clock edge.",
                  },
                ],
              },
            ],
          },
          fallback: [
            {
              type: "paragraph",
              content: [{ type: "text", value: "The counter starts at zero." }],
            },
          ],
          accessibility: { label: "Interactive clocked counter" },
          payload: { source: "./counter.json" },
        }),
      ],
    });
    const prepared = prepare(input, { registry }).document;
    if (!prepared) throw new Error("Expected a prepared document.");
    return prepared;
  }

  it("compiles an embeddable fragment and a mount manifest", () => {
    const prepared = preparedArticle();
    const publication = compilePublication(prepared);
    expect(publication.format).toBe("publisle:publication");
    expect(publication.formatVersion).toBe(1);
    expect(publication.rendererBuild).toBe("1");
    expect(
      publication.html.startsWith(
        '<div class="publisle-document" data-publisle-root>',
      ),
    ).toBe(true);
    expect(publication.html).toContain("data-publisle-island=");
    expect(publication.html).toContain("data-publisle-fallback");
    expect(publication.html).toContain("data-publisle-mount");
    expect(publication.html).toContain("data-publisle-activate");
    expect(publication.html).toContain("The counter starts at zero.");
    expect(publication.html).not.toContain("<!doctype");
    expect(publication.html).not.toContain("<html");
    expect(publication.html).not.toContain("<head");
    expect(publication.html).not.toContain("<body");
    expect(publication.html).not.toContain("<script");
    expect(publication.html).not.toContain("counter.json");
    expect(publication.html).not.toContain(' id="');
    expect(publication.metadata?.title).toBe("Counter guide");
    expect(publication.styles).toEqual([{ id: DOCUMENT_STYLESHEET_ID }]);
    expect(publication.modules).toEqual([
      { id: "publisle:interactive-schematic" },
    ]);
    expect(publication.islands).toHaveLength(1);
    expect(publication.islands[0]).toMatchObject({
      implementation: "publisle:interactive-schematic",
      activation: "interaction",
      mode: "mount",
      props: { source: "./counter.json" },
    });
    expect(publication.islands[0]?.props).not.toHaveProperty("content");
    expect(compilePublication(prepared).identity).toBe(publication.identity);
    expect(compilePublication(prepared, { styles: "none" }).styles).toEqual([]);
  });

  it("namespaces recorded ids per placement", () => {
    const prepared = preparedArticle();
    const publication = compilePublication(prepared);
    const first = instantiatePublication(publication, "primary");
    const second = instantiatePublication(publication, "secondary");
    const headingId = prepared.blocks[0]?.id ?? "";
    expect(first.html).toContain(`id="primary-${headingId}"`);
    expect(second.html).toContain(`id="secondary-${headingId}"`);
    expect(first.html).not.toContain(`id="secondary-${headingId}"`);
    expect(first.html).toContain('href="#primary-footnote-note"');
    expect(second.html).toContain('href="#secondary-footnote-note"');
    expect(first.html).toContain("Clocked counter");
    expect(first.html).toContain("See the note.");
  });

  it("attaches islands inside one root and preserves the fallback on failure", async () => {
    const publication = compilePublication(preparedArticle());
    const island = publication.islands[0];
    if (!island) throw new Error("Expected an island.");
    const root = new ElementStub();
    root.append(islandTree(island.key));
    const loader = vi.fn(() => Promise.resolve({ default: "component" }));
    const mount = vi.fn(() => {
      throw new Error("mount failed");
    });
    const unmount = vi.fn();
    const handle = attachPublication(
      root as unknown as HTMLElement,
      publication,
      {
        implementations: { "publisle:interactive-schematic": loader },
        mount,
        unmount,
      },
    );
    const again = attachPublication(
      root as unknown as HTMLElement,
      publication,
      {
        implementations: { "publisle:interactive-schematic": loader },
        mount,
        unmount,
      },
    );
    expect(again).toBe(handle);
    expect(loader).toHaveBeenCalledOnce();
    const section = root.children[0];
    const fallback = section?.children[0];
    const button = section?.children[2];
    const click = section?.listeners.get("click");
    click?.({ target: fallback } as unknown as Event);
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    click?.({ target: button } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
    expect(fallback?.hidden).toBe(false);
    handle.dispose();
    handle.dispose();
    expect(unmount).not.toHaveBeenCalled();
  });

  it("reuses one module, reports missing implementations, and rejects hydrate", () => {
    const publication = compilePublication(preparedArticle());
    const island = publication.islands[0];
    if (!island) throw new Error("Expected an island.");
    const root = new ElementStub();
    root.append(islandTree(island.key));
    root.append(islandTree(island.key));
    const loader = vi.fn(() => Promise.resolve({ default: "component" }));
    const mount = vi.fn(() => ({ mounted: true }));
    attachPublication(root as unknown as HTMLElement, publication, {
      implementations: { "publisle:interactive-schematic": loader },
      mount,
      unmount: vi.fn(),
    });
    expect(loader).toHaveBeenCalledOnce();

    const missing = new ElementStub();
    missing.append(islandTree(island.key));
    attachPublication(missing as unknown as HTMLElement, publication, {
      mount,
      unmount: vi.fn(),
    });
    expect(missing.children[0]?.getAttribute("data-publisle-missing")).toBe(
      "publisle:interactive-schematic",
    );

    const hydrated = new ElementStub();
    hydrated.append(islandTree(island.key));
    attachPublication(
      hydrated as unknown as HTMLElement,
      {
        ...publication,
        islands: [{ ...island, mode: "hydrate" }],
      },
      {
        implementations: { "publisle:interactive-schematic": loader },
        mount,
        unmount: vi.fn(),
      },
    );
    expect(
      hydrated.children[0]?.getAttribute("data-publisle-unsupported-mode"),
    ).toBe("hydrate");
  });

  it("keeps stylesheet selectors under the publication root", () => {
    const css = readFileSync(
      new URL("../src/document.css", import.meta.url),
      "utf8",
    );
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/@media[^{]+\{/gu, "")
      .split("}")
      .map((rule) => (rule.split("{")[0] ?? "").trim())
      .filter((selector) => selector.length > 0);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.startsWith(".publisle-document")).toBe(true);
    }
  });
});
