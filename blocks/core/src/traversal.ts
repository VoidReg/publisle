import {
  RICH_TRAVERSAL_RULES,
  type TraversalDeclaration,
  type TraversalRule,
} from "@publisle/schema";

const inline: TraversalRule = { items: { ref: "inline" } };
const flow: TraversalRule = { items: { ref: "flow" } };
const resource: TraversalRule = { emit: { kind: "resource" } };
const optional = (rule: TraversalRule): TraversalRule => ({
  ...rule,
  optional: true,
});
const slots: Readonly<Record<string, Readonly<Record<string, TraversalRule>>>> =
  {
    paragraph: { content: inline },
    heading: { content: inline },
    list: { items: { items: { ref: "listItem" } } },
    quote: { children: flow },
    figure: {
      src: resource,
      original: optional({ properties: { src: resource } }),
      caption: optional(flow),
      credit: optional(inline),
    },
    table: { rows: { items: { items: inline } }, caption: optional(flow) },
    callout: { children: flow },
    footnote: { children: flow },
    embed: { caption: optional(flow), fallback: optional(flow) },
    diagram: {
      caption: optional(flow),
      fallback: optional(flow),
      printFallback: optional({ properties: { src: resource } }),
    },
  };
export function coreTraversal(type: string): TraversalDeclaration {
  return {
    root: {
      emit: { kind: "node", type },
      ...(slots[type] ? { properties: slots[type] } : {}),
    },
    rules: RICH_TRAVERSAL_RULES,
  };
}
