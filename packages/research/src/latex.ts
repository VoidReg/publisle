import type { ArticleInline } from "./article.ts";
import type { ResolvedDocument } from "./resolve.ts";

function latexText(value: string): string {
  return value
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replaceAll("$", "\\$")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}");
}

function inlineLatex(
  inlines: readonly ArticleInline[],
  resolved: ResolvedDocument,
  cursor: { index: number },
): string {
  return inlines
    .map((inline) => {
      if (inline.type === "break") return "\\\\\n";
      if (inline.type === "math") return `\\(${inline.value}\\)`;
      if (inline.type === "link")
        return `\\href{${latexText(inline.url)}}{${latexText(inline.value)}}`;
      if (inline.type === "citation") {
        const text = resolved.citations[cursor.index] ?? "";
        cursor.index += 1;
        if (resolved.form === "note") return latexText(text);
        const keys = inline.cluster.items.map((item) => item.id).join(",");
        const locator = inline.cluster.items.find(
          (item) => item.locator !== undefined,
        );
        const optional =
          locator?.locator === undefined
            ? ""
            : `[${latexText(`${locator.label ?? "p."}~${locator.locator}`)}]`;
        const command = resolved.form === "author-date" ? "\\citep" : "\\cite";
        return `${command}${optional}{${keys}}`;
      }
      const value = latexText(inline.value);
      if (inline.mark === "emphasis") return `\\emph{${value}}`;
      if (inline.mark === "strong") return `\\textbf{${value}}`;
      if (inline.mark === "code") return `\\texttt{${value}}`;
      if (inline.mark === "strike") return `\\sout{${value}}`;
      return value;
    })
    .join("");
}

/** Article-class LaTeX. Numeric output uses `cite`; author-date output uses `natbib`. */
export function toLatex(resolved: ResolvedDocument): string {
  const cursor = { index: 0 };
  const title = resolved.article.title ?? "Untitled";
  const authors = resolved.article.authors.join(" \\and ");
  const body: string[] = [];
  let abstract: string[] | undefined;
  const take = (inlines: readonly ArticleInline[]) =>
    inlineLatex(inlines, resolved, cursor);
  for (const block of resolved.article.blocks) {
    const target =
      block.kind !== "footnote" &&
      block.kind !== "bibliography" &&
      block.abstract
        ? (abstract ??= [])
        : body;
    if (block.kind === "heading") {
      if (block.abstract) target.push(`{\\bfseries ${take(block.inlines)}}`);
      else {
        const command =
          block.level <= 1
            ? "section"
            : block.level === 2
              ? "subsection"
              : "subsubsection";
        target.push(`\\${command}{${take(block.inlines)}}`);
      }
    } else if (block.kind === "paragraph") target.push(take(block.inlines));
    else if (block.kind === "list") {
      const environment = block.ordered ? "enumerate" : "itemize";
      target.push(
        `\\begin{${environment}}\n${block.items.map((item) => `\\item ${take(item)}`).join("\n")}\n\\end{${environment}}`,
      );
    } else if (block.kind === "quote") {
      target.push(
        `\\begin{quote}\n${block.paragraphs.map((paragraph) => take(paragraph)).join("\n\n")}\n\\end{quote}`,
      );
    } else if (block.kind === "code")
      target.push(`\\begin{verbatim}\n${block.value}\n\\end{verbatim}`);
    else if (block.kind === "math")
      target.push(
        block.display ? `\\[${block.value}\\]` : `\\(${block.value}\\)`,
      );
    else if (block.kind === "table") {
      const width = block.rows[0]?.length ?? 1;
      const rows = block.rows
        .map((row) => row.map((cell) => take(cell)).join(" & "))
        .join(" \\\\\n");
      target.push(
        `\\begin{tabular}{${"l".repeat(width)}}\n${rows}\n\\end{tabular}`,
      );
    } else if (block.kind === "footnote") {
      body.push(
        `\\paragraph{${latexText(block.id)}} ${block.paragraphs.map((paragraph) => take(paragraph)).join(" ")}`,
      );
    } else body.push("% bibliography");
  }
  const references = resolved.bibliography
    .map((item) => {
      const label =
        resolved.form === "numeric" ? "" : `[${latexText(item.label)}]`;
      return `\\bibitem${label}{${item.id}} ${latexText(item.text)}`;
    })
    .join("\n");
  const packages =
    resolved.form === "author-date"
      ? "\\usepackage[round,authoryear]{natbib}\n"
      : resolved.form === "numeric"
        ? "\\usepackage{cite}\n"
        : "";
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{hyperref}
\\usepackage[normalem]{ulem}
${packages}\\title{${latexText(title)}}
\\author{${authors.length === 0 ? "Anonymous" : authors}}
\\begin{document}
\\maketitle
${abstract === undefined ? "" : `\\begin{abstract}\n${abstract.join("\n\n")}\n\\end{abstract}\n`}
${body.filter((part) => part !== "% bibliography").join("\n\n")}

\\begin{thebibliography}{99}
${references}
\\end{thebibliography}
\\end{document}
`;
}
