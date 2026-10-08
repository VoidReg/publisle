import { MERMAID_SITE_THEME } from "./generated/mermaid-theme.ts";

export const MERMAID_THEME_VARIABLES = {
  darkMode: false,
  background: MERMAID_SITE_THEME.light.surface,
  primaryColor: MERMAID_SITE_THEME.light.raised,
  primaryTextColor: MERMAID_SITE_THEME.light.text,
  primaryBorderColor: MERMAID_SITE_THEME.light.border,
  secondaryColor: MERMAID_SITE_THEME.light.surface,
  secondaryTextColor: MERMAID_SITE_THEME.light.text,
  secondaryBorderColor: MERMAID_SITE_THEME.light.border,
  tertiaryColor: MERMAID_SITE_THEME.light.raised,
  tertiaryTextColor: MERMAID_SITE_THEME.light.text,
  tertiaryBorderColor: MERMAID_SITE_THEME.light.border,
  textColor: MERMAID_SITE_THEME.light.text,
  lineColor: MERMAID_SITE_THEME.light.accent,
  mainBkg: MERMAID_SITE_THEME.light.raised,
  nodeBorder: MERMAID_SITE_THEME.light.border,
  nodeTextColor: MERMAID_SITE_THEME.light.text,
  clusterBkg: MERMAID_SITE_THEME.light.surface,
  clusterBorder: MERMAID_SITE_THEME.light.border,
  edgeLabelBackground: MERMAID_SITE_THEME.light.surface,
  defaultLinkColor: MERMAID_SITE_THEME.light.accent,
  titleColor: MERMAID_SITE_THEME.light.text,
  actorBkg: MERMAID_SITE_THEME.light.raised,
  actorBorder: MERMAID_SITE_THEME.light.border,
  actorTextColor: MERMAID_SITE_THEME.light.text,
  actorLineColor: MERMAID_SITE_THEME.light.border,
  signalColor: MERMAID_SITE_THEME.light.accent,
  signalTextColor: MERMAID_SITE_THEME.light.text,
  labelBoxBkgColor: MERMAID_SITE_THEME.light.raised,
  labelBoxBorderColor: MERMAID_SITE_THEME.light.border,
  labelTextColor: MERMAID_SITE_THEME.light.text,
  loopTextColor: MERMAID_SITE_THEME.light.text,
  noteBkgColor: MERMAID_SITE_THEME.light.raised,
  noteBorderColor: MERMAID_SITE_THEME.light.border,
  noteTextColor: MERMAID_SITE_THEME.light.text,
  activationBkgColor: MERMAID_SITE_THEME.light.raised,
  activationBorderColor: MERMAID_SITE_THEME.light.border,
  pieTitleTextColor: MERMAID_SITE_THEME.light.text,
  pieSectionTextColor: MERMAID_SITE_THEME.light.text,
  pieLegendTextColor: MERMAID_SITE_THEME.light.text,
  fontFamily: MERMAID_SITE_THEME.fontFamily,
};

/** SVG images cannot inherit the surrounding document's CSS custom properties. */
export function themeMermaidSvg(root: Element): void {
  const colors = new Map<string, string>(
    Object.entries(MERMAID_SITE_THEME.light).map(([name, value]) => [
      value,
      `var(--diagram-${name})`,
    ]),
  );
  const replace = (value: string) =>
    value.replace(/#[\da-f]{6}\b|#[\da-f]{3}\b/giu, (color) => {
      const normalized =
        color.length === 4
          ? `#${color.slice(1).replace(/[\da-f]/giu, (c) => c + c)}`
          : color;
      return colors.get(normalized.toLowerCase()) ?? color;
    });
  for (const style of root.querySelectorAll("style"))
    style.textContent = replace(style.textContent);
  for (const element of [root, ...root.querySelectorAll("*")])
    for (const name of ["fill", "stroke", "color", "style"])
      if (element.hasAttribute(name))
        element.setAttribute(name, replace(element.getAttribute(name)!));
  const declarations = (
    palette: typeof MERMAID_SITE_THEME.light | typeof MERMAID_SITE_THEME.dark,
  ) =>
    Object.entries(palette)
      .map(([name, value]) => `--diagram-${name}:${value};`)
      .join("");
  const style = root.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "style",
  );
  style.textContent = `svg{${declarations(MERMAID_SITE_THEME.light)}}@media(prefers-color-scheme:dark){svg{${declarations(MERMAID_SITE_THEME.dark)}}}`;
  root.prepend(style);
}
