import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { coreBlockDefinitions, heading } from "../../blocks/core/src/index.ts";
import {
  assertPrepared,
  createRegistry,
  prepare,
} from "../../packages/core/src/index.ts";
import {
  createBlock,
  document,
  isJsonValue,
  parseInteractiveEnvelope,
} from "../../packages/schema/src/index.ts";
import { digestJson } from "../../packages/contracts/src/index.ts";
import {
  compilePublication,
  instantiatePublication,
  publicationReaderManifest,
} from "../../packages/adapter-core/src/publication.ts";

export async function buildPythonDemo(
  directory: string,
): Promise<{ digest: string; modules: readonly string[] }> {
  // New directory only; do not overwrite an existing user's publication.
  await mkdir(directory);
  const definitions = ["host:counter", "host:missing", "host:unapproved"].map(
    (type) => ({
      type: type as `${string}:${string}`,
      schemaVersion: 1,
      schema: {
        parse: (value: unknown) =>
          parseInteractiveEnvelope(value, (payload) => {
            if (!isJsonValue(payload)) throw new Error("Invalid JSON payload");
            return payload;
          }),
      },
      island: () => ({ activation: "load" as const }),
    }),
  );
  const article = document({
    blocks: [
      heading({
        level: 1,
        content: [
          { type: "text", value: "Python-served precompiled publication" },
        ],
      }),
      ...definitions.flatMap((definition) =>
        Array.from({ length: definition.type === "host:counter" ? 2 : 1 }, () =>
          createBlock({
            type: definition.type,
            data: {
              payload: null,
              initialState: 0,
              activation: "load",
              fallback: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      value:
                        "Authored fallback: the counter starts at zero and increases by one per activation.",
                    },
                  ],
                },
              ],
            },
          }),
        ),
      ),
    ],
  });
  const artifact = compilePublication(
    assertPrepared(
      prepare(article, {
        registry: createRegistry([...coreBlockDefinitions, ...definitions]),
      }),
    ),
  );
  const client = await build({
    configFile: false,
    root: fileURLToPath(new URL("./demo", import.meta.url)),
    logLevel: "silent",
    build: {
      write: false,
      minify: true,
      modulePreload: false,
      rolldownOptions: {
        input: fileURLToPath(new URL("./demo/reader.ts", import.meta.url)),
      },
    },
  });
  if (Array.isArray(client) || !("output" in client))
    throw new Error("Expected client output");
  const entry = client.output.find(
    (item) => item.type === "chunk" && item.isEntry,
  );
  if (entry?.type !== "chunk") throw new Error("Missing client entry");
  const files: { path: string; digest: string; mediaType: string }[] = [];
  const save = async (
    path: string,
    bytes: string | Uint8Array,
    mediaType: string,
  ) => {
    await mkdir(dirname(resolve(directory, path)), { recursive: true });
    await writeFile(resolve(directory, path), bytes);
    files.push({
      path,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      mediaType,
    });
  };
  for (const item of client.output) {
    if (item.type !== "chunk") throw new Error("Unexpected demo asset");
    await save(item.fileName, item.code, "text/javascript; charset=utf-8");
  }
  await save(
    "publication.json",
    JSON.stringify(publicationReaderManifest(artifact)),
    "application/json",
  );
  await save(
    "document.css",
    await readFile(
      new URL("../../packages/adapter-core/src/document.css", import.meta.url),
    ),
    "text/css; charset=utf-8",
  );
  await save(
    "index.html",
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Python publication host</title><link rel="stylesheet" href="/document.css"></head><body>${instantiatePublication(artifact, "first").html}${instantiatePublication(artifact, "second").html}<script type="module" src="/${entry.fileName}"></script></body></html>`,
    "text/html; charset=utf-8",
  );
  const manifest = {
    profile: "urn:publisle:host-site:beta",
    entry: "index.html",
    files,
  };
  await writeFile(resolve(directory, "site.json"), JSON.stringify(manifest));
  return {
    digest: await digestJson(manifest),
    modules: client.output.flatMap((item) =>
      item.type === "chunk" ? Object.keys(item.modules) : [],
    ),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2];
  if (!output)
    throw new Error("Usage: node tools/python/build-demo.ts NEW_DIRECTORY");
  console.log((await buildPythonDemo(resolve(output))).digest);
}
