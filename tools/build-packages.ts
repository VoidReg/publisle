import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

// One program checks cross-package declarations together. Each package receives
// its own emitted source directory; published imports remain package imports.
const root = resolve(import.meta.dirname, "..");
const packages: string[] = [];
for (const group of ["packages", "blocks"]) {
  for (const entry of await readdir(join(root, group), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) {
      const directory = join(root, group, entry.name);
      try {
        const manifest = JSON.parse(
          await readFile(join(directory, "package.json"), "utf8"),
        ) as { publishConfig?: unknown };
        if (manifest.publishConfig) packages.push(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
const output = await mkdtemp(join(tmpdir(), "publisle-build-"));
try {
  const config = ts.readConfigFile(join(root, "tsconfig.base.json"), (path) =>
    ts.sys.readFile(path),
  );
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const parsed = ts.parseJsonConfigFileContent(
    { ...config.config, include: ["packages/*/src/**/*", "blocks/*/src/**/*"] },
    ts.sys,
    root,
  );
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: false,
    rootDir: root,
    outDir: output,
  });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (name) => name,
        getNewLine: () => "\n",
      }),
    );
  const emitted = program.emit(undefined, undefined, undefined, undefined, {
    afterDeclarations: [
      (context) => (source) => {
        const visit: ts.Visitor = (node) => {
          if (
            ts.isStringLiteral(node) &&
            node.text.startsWith(".") &&
            /\.tsx?$/.test(node.text)
          ) {
            return context.factory.createStringLiteral(
              node.text.replace(/\.tsx?$/, ".js"),
            );
          }
          return ts.visitEachChild(node, visit, context);
        };
        return ts.visitNode(source, visit) as ts.SourceFile | ts.Bundle;
      },
    ],
  });
  if (emitted.emitSkipped || emitted.diagnostics.length)
    throw new Error("Package emission failed.");
  for (const directory of packages) {
    const destination = join(directory, "dist");
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await cp(
      join(output, directory.slice(root.length + 1), "src"),
      destination,
      { recursive: true },
    );
    await cp(join(directory, "src"), destination, {
      recursive: true,
      filter: (source) =>
        !/\.(?:ts|tsx)$/.test(source) || source.endsWith(".d.ts"),
    });
  }
  // Emission occurs in a temporary tree. Relocate map source references too,
  // so npm consumers can open the corresponding packaged TypeScript sources.
  for (const directory of packages) {
    const destination = join(directory, "dist");
    const normalizeMaps = async (folder: string): Promise<void> => {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) await normalizeMaps(path);
        else if (entry.name.endsWith(".map")) {
          const map = JSON.parse(await readFile(path, "utf8")) as {
            sources: string[];
            sourceRoot: string;
          };
          const original = join(
            output,
            relative(root, directory),
            "src",
            relative(destination, path),
          );
          map.sources = map.sources.map((source) =>
            relative(
              dirname(path),
              resolve(dirname(original), source),
            ).replaceAll("\\", "/"),
          );
          map.sourceRoot = "";
          await writeFile(path, JSON.stringify(map));
        }
      }
    };
    await normalizeMaps(destination);
  }
  console.log(
    `Built ${String(packages.length)} ESM packages with declarations and source maps.`,
  );
} finally {
  await rm(output, { recursive: true, force: true });
}
