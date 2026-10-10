// Node-side compile service for the playground "Compile PDF" button. Runs the
// Research CLI export against the current editor document. Dev-server only:
// imported by the Vite middleware and the SvelteKit endpoint, never by browser
// bundles.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const assetDir = join(repoRoot, "examples/articles");
const TEMPLATES = new Set([
  "article",
  "article-arabic",
  "ieee-journal",
  "acm-journal",
  "elsevier-numeric",
  "elsevier-author-date",
  "springer-journal",
]);

export interface CompileRequest {
  readonly markdown: string;
  readonly template: string;
  readonly engine?: "pdflatex" | "lualatex";
}

export interface CompileSuccess {
  readonly ok: true;
  readonly pdfBase64: string;
  readonly diagnostics: { readonly code: string; readonly message: string }[];
}

export interface CompileFailure {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
  readonly log: string;
}

export function isTemplate(value: string): boolean {
  return TEMPLATES.has(value);
}

/** Rewrite dev-server asset URLs (`/@fs/<abs-path>`) to local copies. */
function materializeAssets(markdown: string, dir: string): string {
  return markdown.replace(/src="([^"]+)"/g, (whole, rawUrl: string) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawUrl);
    } catch {
      decoded = rawUrl;
    }
    const fsIndex = decoded.indexOf("/@fs/");
    let source: string | undefined;
    if (fsIndex >= 0) {
      const candidate = decoded.slice(fsIndex + 4);
      if (isAbsolute(candidate) && existsSync(candidate)) source = candidate;
    } else if (!decoded.includes("://") && !decoded.startsWith("data:")) {
      const byName = join(assetDir, basename(decoded));
      if (existsSync(byName)) source = byName;
    }
    if (source === undefined) return whole;
    const name = basename(source);
    copyFileSync(source, join(dir, name));
    return `src="./${name}"`;
  });
}

export function compilePaper(
  request: CompileRequest,
): CompileSuccess | CompileFailure {
  const template = request.template;
  if (!isTemplate(template))
    return {
      ok: false,
      status: 400,
      message: `Unknown template "${template}".`,
      log: "",
    };
  const dir = mkdtempSync(join(tmpdir(), "publisle-playground-"));
  try {
    const paper = materializeAssets(request.markdown, dir);
    if (paper.trim() === "")
      return { ok: false, status: 400, message: "Empty document.", log: "" };
    writeFileSync(join(dir, "paper.md"), paper);
    const output = join(dir, "paper.pdf");
    const paperFile = join(dir, "paper.md");
    const cli = join(repoRoot, "packages/cli/src/bin.ts");
    const args = [
      cli,
      "export",
      paperFile,
      "--to",
      "pdf",
      "--template",
      template,
      ...(request.engine ? ["--engine", request.engine] : []),
      "--output",
      output,
    ];
    const result = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 300_000,
    });
    const cliOutput = `${result.stdout}${result.stderr}`;
    const diagnostics = [...cliOutput.matchAll(/\[([a-z][a-z-]+)\]/g)]
      .map((match) => match[1])
      .filter((code): code is string => code !== undefined)
      .filter((code, index, all) => all.indexOf(code) === index)
      .map((code) => ({
        code,
        message:
          cliOutput
            .split("\n")
            .find((line) => line.includes(`[${code}]`))
            ?.replace(/^.*warning \[/, "[")
            .trim() ?? code,
      }));
    if (result.status !== 0 || !existsSync(output)) {
      const first = cliOutput
        .split("\n")
        .find((line) => line.startsWith("publisle: "));
      return {
        ok: false,
        status: result.status ?? 1,
        message:
          first?.replace(/^publisle: /, "") ??
          `Export failed (exit ${String(result.status)}). Ensure the compiler is installed: pnpm cli setup compiler`,
        log: cliOutput.slice(-4000),
      };
    }
    return {
      ok: true,
      pdfBase64: readFileSync(output).toString("base64"),
      diagnostics,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
