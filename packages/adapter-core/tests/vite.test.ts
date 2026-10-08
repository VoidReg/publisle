import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { createPublisleVitePlugin } from "../src/vite.ts";
import {
  noticeCodec,
  noticeDefinition,
} from "../../markdown/tests/fixtures/notice-codec.ts";
import { researchPaperProfile } from "../../profiles/src/index.ts";

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
  it.each(["native", "interactive"] as const)(
    "uses host codecs/current versions for unversioned %s v2-only plugins",
    async (kind) => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "publisle-codec-vite-"),
      );
      const filename = path.join(directory, "article.md");
      await writeFile(
        filename,
        kind === "native"
          ? ':::notice{message="Hello"}\n:::\n'
          : `:::interactive{type="demo:scene"}\n${fence}publisle-payload\n{"value":42}\n${fence}\n:::\n`,
      );
      const registry = createRegistry(
        kind === "native"
          ? [{ ...noticeDefinition, migrations: [] }]
          : [
              {
                type: "demo:scene",
                schemaVersion: 2,
                schema: { parse: (value) => value },
              },
            ],
      );
      const server = await createServer({
        configFile: false,
        root: directory,
        logLevel: "silent",
        server: { middlewareMode: true },
        plugins: [
          createPublisleVitePlugin({
            registry,
            // Registry version takes priority even if an independently registered codec is older.
            markdownCodecs: [{ ...noticeCodec, schemaVersion: 1 }],
            target: {
              name: "codec-test",
              extension: "js",
              emitModule: (plan) =>
                `export const blocks = ${JSON.stringify(plan.document.blocks)};`,
            },
          }),
        ],
      });
      try {
        const resolved = await server.pluginContainer.resolveId(filename);
        if (!resolved) throw new Error("Expected resolved article.");
        const loaded = await server.pluginContainer.load(resolved.id);
        const code = typeof loaded === "string" ? loaded : loaded?.code;
        expect(code).toContain('"schemaVersion":2');
        expect(code).toContain(
          kind === "native" ? '"message":"Hello"' : '"payload":{"value":42}',
        );
      } finally {
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("forwards host resource resolution and locates missing-resource build errors", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "publisle-resource-vite-"),
    );
    const filename = path.join(directory, "article.md");
    await writeFile(filename, '# Title\n\n:::figure{src="missing.svg"}\n:::\n');
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [
        publislePublication({
          registry: createRegistry(coreBlockDefinitions),
          resourceResolver: { version: "1", resolve: () => undefined },
        }),
      ],
    });
    try {
      const resolved = await server.pluginContainer.resolveId(filename);
      if (!resolved) throw new Error("Expected resolved article.");
      const load = server.pluginContainer.load(resolved.id);
      await expect(load).rejects.toThrow("missing-resource");
      await expect(load).rejects.toMatchObject({
        loc: { file: filename, line: 3, column: 0 },
      });
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports preparation failures at original Markdown block locations", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "publisle-source-vite-"),
    );
    const filename = path.join(directory, "article.md");
    await writeFile(filename, '# Title\n\nSee :ref[]{target="missing"}.\n');
    const server = await createServer({
      configFile: false,
      root: directory,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [
        publislePublication({ registry: createRegistry(coreBlockDefinitions) }),
      ],
    });
    try {
      const resolved = await server.pluginContainer.resolveId(filename);
      if (!resolved) throw new Error("Expected resolved article.");
      const load = server.pluginContainer.load(resolved.id);
      await expect(load).rejects.toThrow("unresolved-cross-reference");
      await expect(load).rejects.toMatchObject({
        loc: { file: filename, line: 3, column: 0 },
      });
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(["info", "warning", "error"] as const)(
    "applies %s profile policy at the build boundary",
    async (level) => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "publisle-profile-vite-"),
      );
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
            profiles: [researchPaperProfile()],
            diagnosticPolicy: { "missing-abstract": level },
          }),
        ],
      });
      try {
        const resolved = await server.pluginContainer.resolveId(filename);
        if (!resolved) throw new Error("Expected resolved article.");
        const load = server.pluginContainer.load(resolved.id);
        if (level === "error") {
          await expect(load).rejects.toThrow("abstract");
        } else {
          const loaded = await load;
          const code = typeof loaded === "string" ? loaded : loaded?.code;
          if (!code) throw new Error("Expected emitted JavaScript.");
          const emitted = path.join(directory, "article.mjs");
          await writeFile(emitted, code);
          const imported = (await import(pathToFileURL(emitted).href)) as {
            publication: PublicationArtifact;
            diagnostics: readonly {
              code: string;
              level: string;
              profile?: string;
            }[];
          };
          expect(imported.diagnostics).toContainEqual(
            expect.objectContaining({
              code: "missing-abstract",
              level,
              profile: "research-paper",
            }),
          );
          expect(imported.publication.diagnostics).toEqual(
            imported.diagnostics,
          );
          expect(code).not.toContain("inspectProfiles");
          expect(code).not.toContain("researchPaperProfile");
        }
      } finally {
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

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
        props: expect.objectContaining({
          inputVersion: 1,
          payload: { source: "./counter.json" },
        }) as unknown,
      }),
    ]);
  });
});
