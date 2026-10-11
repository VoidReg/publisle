// Serves each document's exact Markdown source at /docs/<repo path>, e.g.
// /docs/guides/meaning.md and /docs/standards/README.md. Prerendered at build;
// no dependency on external raw hosts.
import { readFileSync } from "node:fs";
import type { APIRoute } from "astro";
import { docSources } from "../../lib/docs-source";

export const getStaticPaths = () =>
  docSources().map((source) => ({
    params: { slug: source.repoPath },
    props: { file: source.file },
  }));

export const GET: APIRoute = ({ props }) => {
  const markdown = readFileSync(props.file as string, "utf8");
  return new Response(markdown, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
