import json_value from "../schemas/json-value.json" with { type: "json" };
import rich_content from "../schemas/rich-content.json" with { type: "json" };
import metadata from "../schemas/metadata.json" with { type: "json" };
import paragraph from "../schemas/paragraph.json" with { type: "json" };
import heading from "../schemas/heading.json" with { type: "json" };
import list from "../schemas/list.json" with { type: "json" };
import quote from "../schemas/quote.json" with { type: "json" };
import code from "../schemas/code.json" with { type: "json" };
import math from "../schemas/math.json" with { type: "json" };
import figure from "../schemas/figure.json" with { type: "json" };
import table from "../schemas/table.json" with { type: "json" };
import callout from "../schemas/callout.json" with { type: "json" };
import divider from "../schemas/divider.json" with { type: "json" };
import footnote from "../schemas/footnote.json" with { type: "json" };
import bibliography from "../schemas/bibliography.json" with { type: "json" };
import raw_html from "../schemas/raw-html.json" with { type: "json" };
import embed from "../schemas/embed.json" with { type: "json" };
import diagram from "../schemas/diagram.json" with { type: "json" };
import interactive_envelope from "../schemas/interactive-envelope.json" with { type: "json" };
import interactive_schematic from "../schemas/interactive-schematic.json" with { type: "json" };
import block_envelope from "../schemas/block-envelope.json" with { type: "json" };
import block from "../schemas/block.json" with { type: "json" };
import document from "../schemas/document.json" with { type: "json" };
import type { PortableJsonSchema } from "./validate.ts";
import semantics from "../schemas/semantics.json" with { type: "json" };
import traversal from "../schemas/traversal.json" with { type: "json" };
import explanation from "../schemas/explanation.json" with { type: "json" };
import readable from "../schemas/readable.json" with { type: "json" };
import foundation_diagnostic from "../schemas/foundation-diagnostic.json" with { type: "json" };

/** Reviewed beta schemas. IDs identify schema resources, not network endpoints. */
export const BETA_SCHEMAS = {
  semantics,
  traversal,
  explanation,
  readable,
  "foundation-diagnostic": foundation_diagnostic,
  "json-value": json_value,
  "rich-content": rich_content,
  metadata: metadata,
  paragraph: paragraph,
  heading: heading,
  list: list,
  quote: quote,
  code: code,
  math: math,
  figure: figure,
  table: table,
  callout: callout,
  divider: divider,
  footnote: footnote,
  bibliography: bibliography,
  "raw-html": raw_html,
  embed: embed,
  diagram: diagram,
  "interactive-envelope": interactive_envelope,
  "interactive-schematic": interactive_schematic,
  "block-envelope": block_envelope,
  block: block,
  document: document,
} as const satisfies Readonly<Record<string, PortableJsonSchema>>;

export const BETA_SCHEMA_DEPENDENCIES = Object.values(BETA_SCHEMAS);
