/** Host policy: changing it invalidates all pre-rendered and session previews. */
export const MERMAID_VERSION = "12.1.0";
export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  layout: "dagre",
  theme: "base",
  look: "classic",
  fontFamily: MERMAID_SITE_THEME.fontFamily,
  themeVariables: MERMAID_THEME_VARIABLES,
  htmlLabels: false,
  flowchart: { htmlLabels: false, look: "classic", theme: "base" },
  suppressErrorRendering: true,
  maxTextSize: 50_000,
  maxEdges: 500,
  secure: [
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "maxEdges",
    "suppressErrorRendering",
    "layout",
    "theme",
    "themeVariables",
    "look",
    "fontFamily",
    "htmlLabels",
    "flowchart",
  ],
} as const;

export function diagramKey(source: string): string {
  return JSON.stringify([
    MERMAID_VERSION,
    MERMAID_CONFIG,
    "svg-image-site-theme-v2",
    MERMAID_SITE_THEME,
    source,
  ]);
}

export function validateMermaidSource(source: string): void {
  if (source.length > MERMAID_CONFIG.maxTextSize)
    throw new Error("Diagram exceeds the 50,000 character preview limit.");
  // Mermaid's legacy detector can select ELK even when layout is a secure key.
  if (
    /^\s*flowchart-elk\b/imu.test(source) ||
    /["']?(?:layout|defaultRenderer)["']?\s*:\s*["']?elk[\w.-]*\b/iu.test(
      source,
    )
  )
    throw new Error(
      "ELK requests are not supported by the optimized Dagre preview.",
    );
}
import { MERMAID_SITE_THEME } from "./generated/mermaid-theme.ts";
import { MERMAID_THEME_VARIABLES } from "./mermaid-theme.ts";
