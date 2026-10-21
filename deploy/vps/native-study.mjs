// Feasibility adapter only: neutral Article -> Pandoc Typst source -> native PDF.
// Publisher classes and PDF/UA-2 parity are deliberately not implied.
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  copyFile,
} from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromMarkdown } from "../../packages/markdown/src/index.ts";
import { prepare, createRegistry } from "../../packages/core/src/index.ts";
import { coreBlockDefinitions } from "../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../blocks/technical/src/index.ts";
import { resolveDocument } from "../../packages/research/src/resolve.ts";
const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const escape = (value) => String(value).replace(/([\\`*_\[\]<>|])/gu, "\\$1");
export async function compileNative(request, _signal, options) {
  const directory = await mkdtemp(join(tmpdir(), "publisle-native-study-"));
  try {
    const started = performance.now();
    const doc = fromMarkdown(request.markdown).document;
    if (!doc) throw new Error("Invalid native study input");
    const prepared = prepare(doc, {
      registry: createRegistry([
        ...coreBlockDefinitions,
        interactiveSchematicDefinition,
      ]),
    });
    if (
      !prepared.document ||
      prepared.diagnostics.some((d) => d.level === "error")
    )
      throw new Error("Native study input failed schema preparation");
    const resolved = resolveDocument(prepared.document, request.style);
    const article = resolved.article;
    const ordinals = new Map();
    const counts = {};
    for (const block of article.blocks)
      if (block.label) {
        const kind = block.kind;
        counts[kind] = (counts[kind] ?? 0) + 1;
        ordinals.set(block.label, String(counts[kind]));
      }
    const notes = new Map(
      article.blocks.filter((b) => b.kind === "footnote").map((b) => [b.id, b]),
    );
    let citation = 0;
    function inline(items) {
      return items
        .map((item) => {
          if (item.type === "math") return `$${item.value}$`;
          if (item.type === "break") return "  \n";
          if (item.type === "link")
            return `[${escape(item.value)}](${item.url})`;
          if (item.type === "citation")
            return escape(resolved.citations[citation++] ?? "");
          if (item.type !== "text")
            throw new Error(`Unsupported inline: ${item.type}`);
          if (item.reference?.kind === "cross")
            return escape(ordinals.get(item.reference.target) ?? item.value);
          if (item.reference?.kind === "footnote") {
            if (!notes.has(item.reference.target))
              throw new Error("Missing footnote");
            return `[^${item.reference.target}]`;
          }
          const text = escape(item.value);
          return item.mark === "strong"
            ? `**${text}**`
            : item.mark === "emphasis"
              ? `*${text}*`
              : item.mark === "code"
                ? `\`${item.value}\``
                : text;
        })
        .join("");
    }
    const blocks = [];
    for (const block of article.blocks) {
      if (block.kind === "heading")
        blocks.push(`${"#".repeat(block.level)} ${inline(block.inlines)}`);
      else if (block.kind === "paragraph") blocks.push(inline(block.inlines));
      else if (block.kind === "math")
        blocks.push(
          block.display ? `$$\n${block.value}\n$$` : `$${block.value}$`,
        );
      else if (block.kind === "quote")
        blocks.push(
          block.paragraphs.map((p) => `> ${inline(p)}`).join("\n>\n"),
        );
      else if (block.kind === "list")
        blocks.push(
          block.items
            .map((p, i) => `${block.ordered ? `${i + 1}.` : "-"} ${inline(p)}`)
            .join("\n"),
        );
      else if (block.kind === "code")
        blocks.push(`\`\`\`\n${block.value}\n\`\`\``);
      else if (block.kind === "table") {
        const rows = block.rows.map(
          (row) => `| ${row.map(inline).join(" | ")} |`,
        );
        rows.splice(1, 0, `| ${block.rows[0].map(() => "---").join(" | ")} |`);
        blocks.push(
          rows.join("\n") +
            (block.caption ? `\n\n: ${inline(block.caption)}` : ""),
        );
      } else if (block.kind === "figure") {
        const name = basename(block.src);
        let asset;
        for (const folder of ["sites/www/public", "examples/articles"])
          try {
            asset = await readFile(join(root, folder, name));
            break;
          } catch {
            /* fixture search */
          }
        if (!asset) throw new Error(`Missing native study figure: ${name}`);
        await writeFile(join(directory, name), asset);
        blocks.push(
          `![${inline(block.caption) || escape(block.alt)}](${name})`,
        );
      } else if (block.kind === "bibliography")
        blocks.push(
          "# References\n\n" +
            resolved.bibliography.map((e) => escape(e.text)).join("\n\n"),
        );
      else if (block.kind === "footnote")
        blocks.push(
          `[^${block.id}]: ${block.paragraphs.map(inline).join("\n\n    ")}`,
        );
      else throw new Error(`Unsupported block: ${block.kind}`);
    }
    const markdown = `---\ntitle: ${JSON.stringify(article.title ?? "Article")}\nauthor: ${JSON.stringify(article.authors)}\nlang: ${article.language ?? "en"}\n---\n\n${blocks.join("\n\n")}\n`;
    await writeFile(join(directory, "article.md"), markdown);
    const projectedMs = performance.now() - started;
    const convertAt = performance.now();
    const conversion = await execute(
      join(root, ".local/benchmark-bin/pandoc"),
      [
        "--from=markdown+tex_math_dollars",
        "--to=typst",
        "--standalone",
        "article.md",
        "--output=article.typ",
      ],
      { cwd: directory },
    );
    if (/Could not convert TeX math/iu.test(conversion.stderr))
      throw new Error(conversion.stderr);
    const typstSource = await readFile(join(directory, "article.typ"), "utf8");
    await writeFile(
      join(directory, "article.typ"),
      '#set math.equation(numbering: "(1)")\n' + typstSource,
    );
    const conversionMs = performance.now() - convertAt;
    const compileAt = performance.now();
    await execute(
      join(root, ".local/benchmark-bin/typst"),
      ["compile", "--root", directory, "article.typ", "article.pdf"],
      { cwd: directory, timeout: 170000 },
    );
    const timings = {
      projectionMs: projectedMs,
      conversionMs,
      nativeCompileMs: performance.now() - compileAt,
    };
    options.onTimings?.(timings);
    if (options.studyDirectory) {
      await mkdir(options.studyDirectory, { recursive: true });
      for (const file of ["article.md", "article.typ", "article.pdf"])
        await copyFile(
          join(directory, file),
          join(options.studyDirectory, file),
        );
      await writeFile(
        join(options.studyDirectory, "losses.json"),
        JSON.stringify(resolved.losses, null, 2),
      );
    }
    return {
      pdf: await readFile(join(directory, "article.pdf")),
      diagnostics: resolved.losses,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
