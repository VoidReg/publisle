import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isPlainObject, type Diagnostic } from "@publisle/schema";
import { processSource, type CliConfig } from "./index.ts";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const help = `Usage: publisle validate|upgrade <file.json|file.md> [--config <host.mjs|host.ts>] [--format json|markdown]
Upgrade only: [--output <new-file> | --in-place]
Validation never writes. Upgrade defaults to stdout preview. --output refuses existing files.
Config is trusted executable host code exporting a default CliConfig. Node >=24 required.
Exit codes: 0 success (warnings allowed), 1 document errors, 2 usage/config/I/O errors.
`;

function diagnosticText(item: Diagnostic, file: string): string {
  const where = item.sourceLocation;
  return `${where?.source ?? file}${where ? `:${String(where.line)}:${String(where.column)}` : ""}: ${item.level} [${item.code}]${item.blockId ? ` (${item.blockId})` : ""}${item.profile ? ` {${item.profile}}` : ""}: ${item.message}\n`;
}

async function loadConfig(file: string | undefined): Promise<CliConfig> {
  if (!file) return {};
  const imported: unknown = await import(pathToFileURL(resolve(file)).href);
  if (
    !isPlainObject(imported) &&
    !(typeof imported === "object" && imported !== null)
  )
    throw new Error("Config must export a default CliConfig object.");
  const config: unknown = (imported as Record<string, unknown>)["default"];
  if (!isPlainObject(config))
    throw new Error("Config must export a default CliConfig object.");
  const preparation = config["prepare"];
  if (
    preparation !== undefined &&
    (!isPlainObject(preparation) ||
      typeof (preparation["registry"] as { get?: unknown } | undefined)?.get !==
        "function")
  )
    throw new Error(
      "config.prepare must provide a registry created with createRegistry().",
    );
  if (
    isPlainObject(preparation) &&
    preparation["unknownBlocks"] !== undefined &&
    preparation["unknownBlocks"] !== "preserve" &&
    preparation["unknownBlocks"] !== "error"
  )
    throw new Error("config.prepare.unknownBlocks must be preserve or error.");
  const markdown = config["markdown"];
  if (
    markdown !== undefined &&
    (!isPlainObject(markdown) ||
      (markdown["codecs"] !== undefined && !Array.isArray(markdown["codecs"])))
  )
    throw new Error("config.markdown must contain an optional codecs array.");
  return config;
}

async function replaceSource(
  file: string,
  original: string,
  output: string,
): Promise<void> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1)
    throw new Error(
      "--in-place requires a regular non-symlink file with one hard link.",
    );
  const temporary = await mkdtemp(join(dirname(file), ".publisle-upgrade-"));
  const staged = join(temporary, "source");
  try {
    await writeFile(staged, output, { flag: "wx", mode: stat.mode & 0o777 });
    await chmod(staged, stat.mode & 0o777);
    const current = await lstat(file);
    if (
      current.dev !== stat.dev ||
      current.ino !== stat.ino ||
      current.nlink !== 1 ||
      !current.isFile() ||
      (await readFile(file, "utf8")) !== original
    )
      throw new Error(
        "Source changed while upgrading; refusing to overwrite it.",
      );
    await rename(staged, file);
  } finally {
    await unlink(staged).catch((cause: unknown) => {
      if (!(
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "ENOENT"
      ))
        throw cause;
    });
    await rmdir(temporary);
  }
}

/** Optional Node-only runner. Validation and preview never invoke a write operation. */
export async function runCli(
  args: readonly string[],
  io: CliIo,
): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    io.stdout(help);
    return 0;
  }
  try {
    const command = args[0];
    if (command !== "validate" && command !== "upgrade")
      throw new Error("Expected validate or upgrade.");
    let file: string | undefined;
    let configFile: string | undefined;
    let outputFile: string | undefined;
    let format: "json" | "markdown" | undefined;
    let inPlace = false;
    const seen = new Set<string>();
    for (let index = 1; index < args.length; index++) {
      const arg = args[index];
      if (arg === undefined) continue;
      if (!arg.startsWith("-")) {
        if (file) throw new Error("Only one input file is supported.");
        file = arg;
        continue;
      }
      if (seen.has(arg)) throw new Error(`Duplicate option ${arg}.`);
      seen.add(arg);
      if (arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg !== "--config" && arg !== "--output" && arg !== "--format")
        throw new Error(`Unknown option ${arg}.`);
      const value = args[++index];
      if (!value || value.startsWith("-"))
        throw new Error(`Missing value for ${arg}.`);
      if (arg === "--config") configFile = value;
      if (arg === "--output") outputFile = value;
      if (arg === "--format") {
        if (value !== "json" && value !== "markdown")
          throw new Error("--format must be json or markdown.");
        format = value;
      }
    }
    if (!file) throw new Error("An input file is required.");
    if (command === "validate" && (outputFile || inPlace))
      throw new Error("validate does not accept write options.");
    if (outputFile && inPlace)
      throw new Error("Choose --output or --in-place, not both.");
    file = resolve(file);
    if (outputFile && resolve(outputFile) === file)
      throw new Error("Use --in-place to authorize replacing the input.");
    if (!format) {
      const extension = extname(file).toLowerCase();
      if (extension === ".json") format = "json";
      else if (extension === ".md" || extension === ".markdown")
        format = "markdown";
      else
        throw new Error(
          "Unknown file extension; provide --format json|markdown.",
        );
    }
    const original = await readFile(file, "utf8");
    const config = await loadConfig(configFile);
    const result = processSource(original, {
      command,
      format,
      sourceName: file,
      config,
    });
    for (const item of result.diagnostics)
      io.stderr(diagnosticText(item, file));
    if (result.diagnostics.some(({ level }) => level === "error")) return 1;
    if (command === "validate") {
      io.stderr(`${file}: valid\n`);
      return 0;
    }
    if (result.output === undefined)
      throw new Error("Upgrade produced no output.");
    if (inPlace) await replaceSource(file, original, result.output);
    else if (outputFile)
      await writeFile(resolve(outputFile), result.output, { flag: "wx" });
    else io.stdout(result.output);
    return 0;
  } catch (cause) {
    io.stderr(
      `publisle: ${cause instanceof Error ? cause.message : "CLI operation failed."}\n${help}`,
    );
    return 2;
  }
}
