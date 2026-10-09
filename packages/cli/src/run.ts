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
import {
  isPlainObject,
  parseDocument,
  parseJson,
  type Diagnostic,
} from "@publisle/schema";
import { toReadingMarkdown } from "@publisle/markdown";
import { processSource, lockSource, type CliConfig } from "./index.ts";
import {
  exportSemanticDocument,
  inspectDocument,
  validateContractBundle,
} from "@publisle/contracts";
import { createRegistry } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";

/**
 * The only sanctioned seam between the Core CLI and the Research profile: the
 * optional plugin is loaded dynamically, so a Core-only install carries no
 * research, template, or TeX tooling. Type-only knowledge of the plugin shape
 * is erased at runtime.
 */
type ResearchPlugin = typeof import("@publisle/cli-research");

const researchCommands = [
  "export",
  "bibliography",
  "doctor",
  "setup",
] as const;

type ResearchCommandName = (typeof researchCommands)[number];

function isResearchCommand(value: string | undefined): value is ResearchCommandName {
  return (researchCommands as readonly string[]).includes(value ?? "");
}

async function loadResearchPlugin(): Promise<ResearchPlugin | undefined> {
  try {
    return (await import("@publisle/cli-research"));
  } catch (cause) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      (cause.code === "ERR_MODULE_NOT_FOUND" ||
        cause.code === "ERR_UNSUPPORTED_RESOLVE")
    )
      return undefined;
    throw cause;
  }
}

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const help = `Usage: publisle validate|upgrade|lock <file.json|file.md> [--config <host.mjs|host.ts>] [--format json|markdown]
JSON-only inspection: publisle inspect|semantic <source.json> [--bundle <contracts.json>] [--mode linked|standalone]
Reading projection: publisle reading <source.json> (not a round trip).
Research profile (requires the optional @publisle/cli-research plugin):
  publisle export <file.json|file.md> --to bibtex|csl-json|latex|jats|pdf|submission [--template ...] [--output <new-file>]
  publisle bibliography <file.bib> | publisle doctor | publisle setup compiler
Upgrade: [--output <new-file> | --in-place]. Lock: [--output <new-file>] (never in-place).
--output refuses existing files.
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
    if (isResearchCommand(command)) {
      const plugin = await loadResearchPlugin();
      if (plugin === undefined) {
        io.stderr(
          `publisle: ${command} belongs to the Publisle Research profile. Install @publisle/cli-research alongside @publisle/cli to use it.\n`,
        );
        return 2;
      }
      return await plugin.runResearchCommand(command, args, io, {
        loadConfig: (file) => loadConfig(file),
        diagnosticText,
      });
    }
    if (command === "reading") {
      if (args.length !== 2 || !args[1] || args[1].startsWith("-"))
        throw new Error("reading requires only canonical source.json");
      const source = parseDocument(parseJson(await readFile(resolve(args[1]))));
      const result = toReadingMarkdown(source);
      for (const item of result.diagnostics)
        io.stderr(diagnosticText(item, args[1]));
      if (result.markdown === undefined) return 1;
      io.stdout(result.markdown);
      return 0;
    }
    if (command === "inspect" || command === "semantic") {
      const file = args[1];
      if (!file || file.startsWith("-"))
        throw new Error("Inspection requires canonical source.json");
      let bundleFile: string | undefined;
      let mode: "linked" | "standalone" = "linked";
      const seen = new Set<string>();
      for (let index = 2; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        if (!key || seen.has(key) || !value || value.startsWith("-"))
          throw new Error("Invalid or duplicate inspection option");
        seen.add(key);
        if (key === "--bundle") bundleFile = value;
        else if (
          key === "--mode" &&
          (value === "linked" || value === "standalone")
        )
          mode = value;
        else
          throw new Error(
            "Inspection accepts only --bundle and --mode linked|standalone; no executable config",
          );
      }
      const source = parseJson(await readFile(resolve(file)));
      const bundle = bundleFile
        ? await validateContractBundle(
            parseJson(await readFile(resolve(bundleFile))),
          )
        : undefined;
      const options = { mode, offline: true, ...(bundle ? { bundle } : {}) };
      const output =
        command === "inspect"
          ? await inspectDocument(source, options)
          : await exportSemanticDocument(source, options);
      io.stdout(JSON.stringify(output, null, 2) + "\n");
      return 0;
    }
    if (command !== "validate" && command !== "upgrade" && command !== "lock")
      throw new Error(
        "Expected validate, upgrade, lock, inspect, semantic, or reading. Research commands (export, bibliography, doctor, setup) require @publisle/cli-research.",
      );
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
    if (command === "lock" && inPlace)
      throw new Error(
        "lock preserves the original source: use stdout preview or --output <new-file>.",
      );
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
    const bytes = await readFile(file);
    let original: string;
    try {
      original = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      io.stderr(
        `${file}: error [invalid-json-unicode]: Input is not valid UTF-8.\n`,
      );
      return 1;
    }
    let config = await loadConfig(configFile);
    if (config.contractBundle !== undefined) {
      const bundle = await validateContractBundle(config.contractBundle);
      config = {
        ...config,
        prepare: {
          ...(config.prepare ?? {
            registry: createRegistry(coreBlockDefinitions),
          }),
          contractPins: bundle.contracts.map((entry) => ({
            type: entry.contract.identity.type,
            schemaVersion: entry.contract.identity.schemaVersion,
            id: entry.id,
            digest: entry.digest,
          })),
        },
      };
    }
    const operation = {
      format,
      sourceName: file,
      config,
    };
    const result =
      command === "lock"
        ? await lockSource(original, operation)
        : processSource(original, { ...operation, command });
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
