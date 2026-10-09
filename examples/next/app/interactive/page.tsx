import Link from "next/link";
import { PublisleArticle, preparePublication } from "@publisle/adapter-next";
import { publicationReaderManifest } from "@publisle/adapter-core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import {
  document,
  createBlock,
  parseInteractiveEnvelope,
  isJsonValue,
} from "@publisle/schema";
import Reader from "./Reader.tsx";
const definition = {
  type: "host:counter" as const,
  schemaVersion: 1,
  schema: {
    parse: (value: unknown) =>
      parseInteractiveEnvelope(value, (payload) => {
        if (!isJsonValue(payload)) throw new Error("Invalid payload");
        return payload;
      }),
  },
  island: () => ({ activation: "load" as const }),
};
export default function Page() {
  const source = document({
    blocks: [
      createBlock({
        type: "host:counter",
        data: {
          payload: {},
          activation: "load",
          fallback: [
            {
              type: "paragraph",
              content: [{ type: "text", value: "Counter fallback" }],
            },
          ],
        },
      }),
    ],
  });
  const publication = preparePublication(source, {
    registry: createRegistry([...coreBlockDefinitions, definition]),
    renderers: { "host:counter": { module: "host:counter" } },
  });
  const manifest = publicationReaderManifest(publication);
  return (
    <main>
      <Link href="/">Static article</Link>
      {["one", "two"].map((instanceId) => (
        <PublisleArticle
          key={instanceId}
          publication={publication}
          instanceId={instanceId}
        >
          <Reader manifest={manifest} instanceId={instanceId} />
        </PublisleArticle>
      ))}
    </main>
  );
}
