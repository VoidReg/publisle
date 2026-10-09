import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { build, type Plugin } from "vite";
import type { AdapterTarget, RenderNode, RenderPlan } from "../src/types.ts";

export interface NativeFixtureResult {
  markup: string;
  code: string;
  modules: string[];
  emitted: string;
  chunks: readonly { fileName: string; modules: readonly string[] }[];
  assets: readonly { fileName: string; bytes: number; gzipBytes: number }[];
  accounting: {
    bundledBytes: number;
    gzipBytes: number;
    frameworkRenderedBytes: number;
    publisleRenderedBytes: number;
    hostRenderedBytes: number;
    bundlerRenderedBytes: number;
  };
}

/** Build isolated host fixtures with the target package's installed dependencies. */
export async function nativeRenderingFixture(options: {
  target: AdapterTarget;
  nodes: readonly RenderNode[];
  dependencyDirectory: string;
  runtime: string;
  files: Readonly<Record<string, string>>;
  plugins?: Plugin[];
  plan?: RenderPlan;
  minify?: boolean;
  browser?: (fixture: NativeFixtureResult & { url: string }) => Promise<void>;
}): Promise<NativeFixtureResult> {
  const directory = await mkdtemp(path.join(tmpdir(), "publisle-native-"));
  try {
    await symlink(
      options.dependencyDirectory,
      path.join(directory, "node_modules"),
      "dir",
    );
    const plan: RenderPlan = options.plan ?? {
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
      oxc: { jsx: { development: false } },
      root: directory,
      logLevel: "silent" as const,
      // Vitest sets NODE_ENV=test; browser fixtures must exercise production framework branches.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
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
        rolldownOptions: { output: { codeSplitting: false } },
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
      css?: string;
    };

    const client = await build({
      ...common,
      build: {
        write: false,
        modulePreload: false,
        minify: options.minify ?? false,
        rolldownOptions: { input: path.join(directory, "client.js") },
      },
    });
    if (Array.isArray(client) || !("output" in client))
      throw new Error("Expected client bundle.");
    const chunks = client.output.filter((item) => item.type === "chunk");
    const accounting = {
      bundledBytes: chunks.reduce(
        (total, chunk) => total + Buffer.byteLength(chunk.code),
        0,
      ),
      gzipBytes: chunks.reduce(
        (total, chunk) => total + gzipSync(chunk.code).byteLength,
        0,
      ),
      frameworkRenderedBytes: 0,
      publisleRenderedBytes: 0,
      hostRenderedBytes: 0,
      bundlerRenderedBytes: 0,
    };
    for (const chunk of chunks)
      for (const [id, module] of Object.entries(chunk.modules)) {
        const group =
          /node_modules\/(?:\.pnpm\/)?(?:react|react-dom|scheduler|svelte)[/@]/u.test(
            id,
          )
            ? "frameworkRenderedBytes"
            : /\/(?:packages\/adapter-|packages\/(?:core|schema|markdown|block-sdk|contracts)\/)/u.test(
                  id,
                )
              ? "publisleRenderedBytes"
              : id.includes(directory)
                ? "hostRenderedBytes"
                : "bundlerRenderedBytes";
        accounting[group] += module.renderedLength;
      }
    const result: NativeFixtureResult = {
      markup: rendered.markup,
      emitted,
      code: chunks.map((chunk) => chunk.code).join("\n"),
      modules: chunks.flatMap((chunk) => Object.keys(chunk.modules)),
      chunks: chunks.map((chunk) => ({
        fileName: chunk.fileName,
        modules: Object.keys(chunk.modules),
      })),
      assets: client.output.map((item) => {
        const source = item.type === "chunk" ? item.code : item.source;
        return {
          fileName: item.fileName,
          bytes: Buffer.byteLength(source),
          gzipBytes: gzipSync(source, { level: 6 }).byteLength,
        };
      }),
      accounting,
    };
    if (options.browser) {
      const clientEntry = chunks.find((chunk) => chunk.isEntry);
      if (!clientEntry) throw new Error("Missing client entry.");
      const assets = new Map(
        client.output.map((item) => [
          `/${item.fileName}`,
          item.type === "chunk" ? item.code : item.source,
        ]),
      );
      const server = createServer((request, response) => {
        const pathname = new URL(request.url ?? "/", "http://fixture.local")
          .pathname;
        if (pathname === "/") {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(
            `<!doctype html><html><head><title>Host Title</title><meta name="host-owned" content="unchanged">${rendered.css ?? ""}</head><body><div id="app">${result.markup}</div><script type="module" src="/${clientEntry.fileName}"></script></body></html>`,
          );
        } else if (assets.has(pathname)) {
          response.setHeader(
            "content-type",
            pathname.endsWith(".css") ? "text/css" : "text/javascript",
          );
          response.end(assets.get(pathname));
        } else {
          response.statusCode = 404;
          response.end();
        }
      });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing fixture address.");
        await options.browser({
          ...result,
          url: `http://127.0.0.1:${address.port}`,
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
