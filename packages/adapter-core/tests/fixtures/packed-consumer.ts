// Copied into an isolated project by test:distribution. This fixture must use
// public packed exports only; it also serves as a minimal issue reproduction.
import { document } from "@publisle/schema";
import { paragraph, coreBlockDefinitions } from "@publisle/blocks-core";
import { prepare, createRegistry } from "@publisle/core";
import {
  compilePublication,
  instantiatePublication,
} from "@publisle/adapter-core";

const source = document({
  blocks: [
    paragraph({ content: [{ type: "text", value: "Packed Core consumer" }] }),
  ],
});
const result = prepare(source, {
  registry: createRegistry(coreBlockDefinitions),
});
if (!result.document) throw new Error("Packed consumer preparation failed.");
const publication = compilePublication(result.document);
const placement = instantiatePublication(publication, "packed-consumer");
if (!placement.html.includes("Packed Core consumer")) {
  throw new Error("Packed consumer HTML rendering failed.");
}
console.log("Packed Core import, preparation and HTML rendering pass.");
