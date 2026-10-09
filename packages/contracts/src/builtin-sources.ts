import type { ContractSource } from "@publisle/schema";
import { BETA_SCHEMAS, BETA_SCHEMA_DEPENDENCIES } from "./schemas.ts";
import fixtures from "../fixtures/structural.json" with { type: "json" };

/** Data-only entry point: importing built-ins never initializes the validator. */
const purposes = {
  paragraph: "A paragraph of rich inline publication content.",
  heading:
    "A section heading with outline level and optional cross-reference label.",
  list: "An ordered or unordered list containing ordinary or checked task items.",
  quote: "A quotation containing nested publication flow content.",
  code: "Literal code; language and fence metadata do not execute the source.",
  math: "Authored LaTeX math source; display mode and labels are publication metadata.",
  figure:
    "A publication figure with resource, optional caption, credit, label and original.",
  table: "Tabular rich content with alignment, caption and stable label.",
  bibliography:
    "Optional citation targets. Entries are informational and do not select a citation style.",
  callout: "An editorial callout with variant, optional title and nested body.",
  divider: "A thematic break separating publication sections.",
  footnote:
    "An identified footnote body referenced from inline publication content.",
  "raw-html":
    "Explicit authored HTML. Portability does not imply sanitization or safety.",
  embed:
    "A restricted provider/resource reference with authored reading or print fallback.",
  diagram:
    "Editable engine-specific diagram source with optional accessible/print fallbacks.",
  "interactive-schematic":
    "External schematic resource and shared interactive content. The sample controls do not parse a netlist or simulate circuits.",
} as const;

const descriptions: Readonly<Record<string, string>> = {
  content: "Rich inline content in authored order.",
  level: "Heading outline depth, from 1 through 6.",
  label: "Stable author-assigned publication target for cross-references.",
  items: "Ordered item sequence; task items include their checked state.",
  ordered: "Whether list numbering is enabled.",
  start: "Optional positive starting number for ordered lists.",
  children: "Nested flow content in authored order.",
  language: "Optional code-fence language hint, not execution permission.",
  meta: "Optional authored code-fence metadata.",
  value:
    "Literal authored source text; interpretation depends on this block's purpose.",
  display: "Whether mathematical source is displayed as a block.",
  src: "Image resource URI; resolution is a host responsibility.",
  alt: "Optional authored alternative description, not generated semantics.",
  caption: "Optional flow caption in publication order.",
  credit: "Rich inline attribution for the resource.",
  original:
    "Optional downloadable original resource with media type and filename hints.",
  title: "Optional authored title.",
  align: "Optional column alignments, in column order.",
  rows: "Table rows and cells in reading order, retaining header-cell flags.",
  variant: "Editorial callout category: note, tip, warning or danger.",
  identifier: "Footnote target identifier used by inline references.",
  inline: "Whether authored HTML is intended for inline placement.",
  aspectRatio: "Optional positive embed layout aspect ratio.",
  provider:
    "Restricted embed provider identifier, not arbitrary executable HTML.",
  resourceId: "Provider-specific resource identifier.",
  fallback:
    "Authored static fallback; never a promise that remote or interactive behavior is portable.",
  engine:
    "Diagram engine identifier. Its source grammar remains engine-specific.",
  source:
    "Authored engine-specific diagram source; rendering does not rewrite it.",
  printFallback: "Optional derived or authored print image resource.",
  accessibility:
    "Optional authored accessible label for the interactive envelope.",
  activation:
    "Island activation policy; execution belongs to the host runtime.",
  payload:
    "Schematic payload: source is an external document URI; no simulator or source-format meaning is declared.",
};

export function builtinContractSource(
  name: keyof typeof purposes,
): ContractSource {
  const dataSchema = BETA_SCHEMAS[name];
  const keys =
    name === "interactive-schematic"
      ? ["payload", "content", "activation", "accessibility", "fallback"]
      : Object.keys("properties" in dataSchema ? dataSchema.properties : {});
  const sample = fixtures.find((entry) => entry.id === `valid-${name}`);
  if (!sample) throw new Error(`Missing built-in contract fixture: ${name}`);
  return {
    mode: "verified-adapter",
    dataSchema,
    schemaDependencies: BETA_SCHEMA_DEPENDENCIES,
    documentation: {
      name,
      purpose: purposes[name],
      properties: Object.fromEntries(
        keys.map((key) => [
          key,
          descriptions[key] ?? "Authored publication content.",
        ]),
      ),
      validExamples: [{ input: sample.value, output: sample.value }],
      invalidExamples: [{ input: null, diagnostic: "invalid-block-data" }],
    },
    behavior: {
      limitations: [
        "The complete structural schema describes canonical data. Existing typed authoring parsers may coerce, default or discard authoring inputs; that behavior remains implementation-bound.",
        ...(name === "interactive-schematic"
          ? ["No netlist interpretation or simulation semantics are defined."]
          : []),
      ],
      executable: {
        parse:
          "Trusted authoring parser; normalized output and rejections are checked against declared fixtures, not proven equivalent for all inputs.",
      },
    },
    projections: {
      reading:
        "Declared traversal and rich publication slots provide reading order; authored readable/fallback content remains optional. Engine source is not a generated description.",
      semantic:
        "Declared semantic entities and bindings only; no invented scientific meaning, executable simulation, or equivalence claim.",
    },
    compatibility: {
      schemaProfile: "urn:publisle:schema-profile:beta",
      semanticProfile: "urn:publisle:meaning:beta",
      runtimeABI: "publisle-island:beta",
    },
    provenance: { publisher: "Publisle contributors", license: "MIT" },
  };
}
