/** Initial MyST mapping. Losses are explicit; this is not a universal round trip. */
import {
  parseJson,
  type Block,
  type BlockType,
  type Diagnostic,
  type Document,
  type UnknownBlock,
} from "@publisle/schema";
import { fromMarkdown } from "./import.ts";
import { toMarkdown } from "./export.ts";

export interface MystLoss {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
}

export const MYST_LOSS_TABLE = [
  {
    construct: "paragraph, heading, emphasis, strong, code, link, list",
    status: "supported",
    note: "Common Markdown constructs map through the archival Markdown subset.",
  },
  {
    construct: "math",
    status: "supported",
    note: "Dollar math maps to authored math source. It is not evaluated.",
  },
  {
    construct: "citation",
    status: "lossy",
    note: "A MyST cite role becomes a citation reference without a citation style.",
  },
  {
    construct: "myst-role",
    status: "unsupported",
    note: "Roles other than cite are kept as their visible text and recorded as losses.",
  },
  {
    construct: "myst-directive",
    status: "unsupported",
    note: "Unknown MyST directives keep their body as text and are marked unsupported.",
  },
  {
    construct: "interactive",
    status: "unsupported",
    note: "Diagrams, embeds, and interactive blocks are fenced as opaque Publisle JSON.",
  },
  {
    construct: "round-trip",
    status: "unsupported",
    note: "Supported examples round-trip only as documented. No universal MyST equivalence is claimed.",
  },
] as const;

const INTERACTIVE = new Set([
  "publisle:diagram",
  "publisle:embed",
  "publisle:interactive-schematic",
]);

export interface MystImport {
  readonly document?: Document;
  readonly losses: readonly MystLoss[];
  readonly diagnostics: readonly Diagnostic[];
}

export function fromMyST(source: string): MystImport {
  const losses: MystLoss[] = [];
  const opaque: UnknownBlock[] = [];
  const withoutOpaque = source.replace(
    /```\{publisle\}\n([\s\S]*?)\n```/gu,
    (_match, json: string) => {
      try {
        const parsed: unknown = parseJson(json);
        if (!Array.isArray(parsed))
          throw new Error("Publisle fence must be an array");
        for (const entry of parsed) opaque.push(entry as UnknownBlock);
      } catch {
        losses.push({
          code: "opaque-source-unreadable",
          path: "publisle",
          detail:
            "The Publisle fence was kept only as text because it is not strict JSON.",
        });
        return json;
      }
      return "";
    },
  );
  const withoutDirectives = withoutOpaque.replace(
    /```\{[^}\n]+\}\n([\s\S]*?)\n```/gu,
    (_match, body: string) => {
      losses.push({
        code: "unsupported-myst-directive",
        path: "directive",
        detail:
          "The directive body is preserved as text. Its MyST behavior is unsupported.",
      });
      return body;
    },
  );
  const normalized = withoutDirectives.replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}`([^`]*)`/gu,
    (match, role: string, body: string) => {
      if (role === "cite") {
        losses.push({
          code: "citation-style-lost",
          path: `cite:${body}`,
          detail:
            "The cite role becomes a citation id. Locator and style information are not inferred.",
        });
        return `:cite[${body}]`;
      }
      losses.push({
        code: "unsupported-myst-role",
        path: role,
        detail: `${match} is preserved as text.`,
      });
      return body;
    },
  );
  const imported = fromMarkdown(normalized);
  if (!imported.document) return { losses, diagnostics: imported.diagnostics };
  return {
    document: {
      ...imported.document,
      blocks: [...imported.document.blocks, ...opaque],
    },
    losses,
    diagnostics: imported.diagnostics,
  };
}

export function toMyST(document: Document): {
  readonly source: string;
  readonly losses: readonly MystLoss[];
} {
  const losses: MystLoss[] = [];
  const prose: Block<BlockType, unknown>[] = [];
  const opaque: Block<BlockType, unknown>[] = [];
  for (const block of document.blocks) {
    if (INTERACTIVE.has(block.type)) {
      losses.push({
        code: "unsupported-interactive",
        path: block.id,
        detail: `${block.type} is not MyST interactive behavior. The block is preserved in a Publisle fence.`,
      });
      opaque.push(block);
    } else prose.push(block);
  }
  const exported = toMarkdown(
    { ...document, blocks: prose },
    { policy: "standard" },
  );
  const fence =
    opaque.length === 0
      ? ""
      : `\n\n\`\`\`{publisle}\n${JSON.stringify(opaque)}\n\`\`\`\n`;
  return { source: `${exported.markdown}${fence}`, losses };
}
