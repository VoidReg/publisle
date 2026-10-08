import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Plugin } from "vite";
import type { AdapterTarget, RenderNode, RenderPlan } from "../src/types.ts";

/** Build isolated host fixtures with the target package's installed dependencies. */
export async function nativeRenderingFixture(options: {
  target: AdapterTarget;
  nodes: readonly RenderNode[];
  dependencyDirectory: string;
  runtime: string;
  files: Readonly<Record<string, string>>;
  plugins?: Plugin[];
}): Promise<{
  markup: string;
  code: string;
  modules: string[];
  emitted: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "publisle-native-"));
  try {
    await symlink(
      options.dependencyDirectory,
      path.join(directory, "node_modules"),
      "dir",
    );
    const plan: RenderPlan = {
      nodes: options.nodes,
      diagnostics: [],
      document: {
        kind: "publisle:prepared-document",
        schemaVersion: 1,
        blocks: [],
        resources: { resources: [] },
        references: { targets: [] },
        islands: [],
        cacheIdentity: "fixture",
      },
    };
    const documentName = `Document.${options.target.extension}`;
    const emitted = options.target.emitModule(plan, {
      source: "",
      filename: documentName,
    });
    for (const [name, content] of Object.entries({
      ...options.files,
      [documentName]: emitted,
    }))
      await writeFile(path.join(directory, name), content);

    const common = {
      configFile: false as const,
      root: directory,
      logLevel: "silent" as const,
      plugins: options.plugins ?? [],
      resolve: {
        alias: {
          [`@publisle/adapter-${options.target.name}/runtime`]: options.runtime,
        },
      },
    };
    const server = await build({
      ...common,
      build: {
        ssr: path.join(directory, "server.js"),
        write: false,
        rolldownOptions: { output: { inlineDynamicImports: true } },
      },
    });
    if (Array.isArray(server) || !("output" in server))
      throw new Error("Expected SSR bundle.");
    const entry = server.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    );
    if (entry?.type !== "chunk") throw new Error("Missing SSR entry.");
    const serverFile = path.join(directory, "server.mjs");
    await writeFile(serverFile, entry.code);
    const rendered = (await import(pathToFileURL(serverFile).href)) as {
      markup: string;
    };

    const client = await build({
      ...common,
      build: {
        write: false,
        minify: false,
        rolldownOptions: { input: path.join(directory, "client.js") },
      },
    });
    if (Array.isArray(client) || !("output" in client))
      throw new Error("Expected client bundle.");
    const chunks = client.output.filter((item) => item.type === "chunk");
    return {
      markup: rendered.markup,
      emitted,
      code: chunks.map((chunk) => chunk.code).join("\n"),
      modules: chunks.flatMap((chunk) => Object.keys(chunk.modules)),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
