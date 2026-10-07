import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry } from "@publisle/core";
import { createServer } from "vite";
import type { PublicationArtifact } from "../src/index.ts";
import { publislePublication } from "../src/vite.ts";

const fence = "`".repeat(3);
const source = `---
title: Counter guide
---

# Clock

:::interactive{type="publisle:interactive-schematic" schemaVersion="2" activation="interaction" label="Interactive clocked counter"}
:::title
Clocked counter
:::

:::fallback
The counter starts at zero.
:::

${fence}publisle-payload
{ "source": "./counter.json" }
${fence}
:::
`;

describe("publication Vite target", () => {
  it("exports a publication fragment from a Markdown module", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "publisle-vite-"));
    const filename = path.join(directory, "article.md");
    await writeFile(filename, source);
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [
        publislePublication({
          registry: createRegistry([
            ...coreBlockDefinitions,
            interactiveSchematicDefinition,
          ]),
        }),
      ],
    });
    let loadedCode: string | undefined;
    try {
      const resolved = await server.pluginContainer.resolveId(filename);
      const loaded = resolved
        ? await server.pluginContainer.load(resolved.id)
        : null;
      loadedCode = typeof loaded === "string" ? loaded : loaded?.code;
    } finally {
      await server.close();
    }
    if (!loadedCode) throw new Error("Expected emitted JavaScript.");
    const emitted = path.join(directory, "article.mjs");
    await writeFile(emitted, loadedCode);
    const imported = (await import(pathToFileURL(emitted).href)) as {
      publication: PublicationArtifact;
      metadata: { title?: string } | null;
      diagnostics: readonly { level: string }[];
    };
    expect(loadedCode).toContain("export const publication");
    expect(loadedCode).toContain("export const metadata");
    expect(loadedCode).toContain("export const diagnostics");
    expect(imported.metadata?.title).toBe("Counter guide");
    expect(imported.diagnostics).toEqual([]);
    expect(imported.publication.format).toBe("publisle:publication");
    expect(
      imported.publication.html.startsWith(
        '<div class="publisle-document" data-publisle-root>',
      ),
    ).toBe(true);
    expect(imported.publication.html).not.toContain("<!doctype");
    expect(imported.publication.html).not.toContain("<html");
    expect(imported.publication.html).not.toContain("<head");
    expect(imported.publication.html).not.toContain("<body");
    expect(imported.publication.islands).toEqual([
      expect.objectContaining({
        implementation: "publisle:interactive-schematic",
        mode: "mount",
        props: { source: "./counter.json" },
      }),
    ]);
  });
});
