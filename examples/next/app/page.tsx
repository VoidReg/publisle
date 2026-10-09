import { loadPublication, PublisleArticle } from "@publisle/adapter-next";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { join } from "node:path";
export const metadata = { title: "Host-owned Next article" };
export default async function Page() {
  const publication = await loadPublication(
    join(process.cwd(), "article.json"),
    { registry: createRegistry(coreBlockDefinitions) },
  );
  return (
    <main>
      <PublisleArticle publication={publication} instanceId="one" />
      <PublisleArticle publication={publication} instanceId="two" />
    </main>
  );
}
