import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBlock, document } from "@publisle/schema";
import { runCli } from "@publisle/cli/run";
import { researchCommandNames, runResearchCommand } from "../src/index.ts";

describe("Research CLI plugin", () => {
  let directory: string;
  let io: { stdout: string; stderr: string };
  let code: number;

  async function invoke(args: readonly string[]) {
    io = { stdout: "", stderr: "" };
    code = await runCli(args, {
      stdout: (text) => {
        io.stdout += text;
      },
      stderr: (text) => {
        io.stderr += text;
      },
    });
  }

  const bibtex = `@article{key2026, title = {Portable articles}, author = {Ada, Author}, year = {2026}}\n`;

  it("declares the research command names", () => {
    expect([...researchCommandNames]).toEqual([
      "export",
      "bibliography",
      "doctor",
      "setup",
    ]);
  });

  it("routes bibliography import through the Core CLI seam", async () => {
    directory = await mkdtemp(join(tmpdir(), "publisle-cli-research-"));
    const file = join(directory, "refs.bib");
    await writeFile(file, bibtex);
    await invoke(["bibliography", file]);
    expect(code).toBe(0);
    const parsed = JSON.parse(io.stdout) as { id: string }[];
    expect(parsed[0]?.id).toBe("key2026");
    await rm(directory, { recursive: true, force: true });
  });

  it("exports BibTeX from an article through the Core CLI seam", async () => {
    directory = await mkdtemp(join(tmpdir(), "publisle-cli-research-"));
    const file = join(directory, "article.json");
    await writeFile(
      file,
      JSON.stringify(
        document({
          blocks: [
            createBlock({
              type: "publisle:bibliography",
              schemaVersion: 1,
              data: {
                entries: [
                  {
                    id: "key2026",
                    title: "Portable articles",
                    authors: ["Ada, Author"],
                    type: "article",
                    issued: "2026",
                  },
                ],
              },
            }),
          ],
        }),
      ),
    );
    await invoke(["export", file, "--to", "bibtex"]);
    expect(code).toBe(0);
    expect(io.stdout).toContain("key2026");
    expect(io.stdout).toContain("Portable articles");
    await rm(directory, { recursive: true, force: true });
  });

  it("exports a zero-TeX html preview from an article", async () => {
    directory = await mkdtemp(join(tmpdir(), "publisle-cli-research-"));
    const file = join(directory, "article.json");
    const output = join(directory, "preview.html");
    await writeFile(
      file,
      JSON.stringify(
        document({
          metadata: { title: "Preview article", language: "en" },
          blocks: [
            createBlock({
              type: "publisle:paragraph",
              schemaVersion: 1,
              data: { content: [{ type: "text", value: "Readable body." }] },
            }),
          ],
        }),
      ),
    );
    await invoke(["export", file, "--to", "html", "--output", output]);
    expect(code).toBe(0);
    const page = await readFile(output, "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain('<html lang="en">');
    expect(page).toContain("<title>Preview article</title>");
    expect(page).toContain("Readable body.");
    await invoke(["export", file, "--to", "html", "--output", output]);
    expect(code).toBe(2);
    expect(io.stderr).toContain("already exists");
    await rm(directory, { recursive: true, force: true });
  });

  it("reports usage errors from research commands on the plugin path", async () => {
    directory = await mkdtemp(join(tmpdir(), "publisle-cli-research-"));
    await invoke(["setup"]);
    expect(code).toBe(2);
    expect(io.stderr).toContain("Use publisle setup compiler");
    await rm(directory, { recursive: true, force: true });
  });

  it("exposes the same behavior when the plugin entrypoint is invoked directly", async () => {
    const lines: string[] = [];
    const exit = await runResearchCommand(
      "bibliography",
      ["bibliography", "--doi"],
      { stdout: (text) => lines.push(text), stderr: () => undefined },
      {
        loadConfig: () => Promise.resolve({}),
        diagnosticText: () => "",
      },
    ).catch((error: unknown) => {
      expect(error instanceof Error).toBe(true);
      return 2;
    });
    expect(exit).toBe(2);
  });
});
