// Math editing engine: searchable symbol palette data plus pure insertion and
// tokenization logic, shared by the math block editor and inline math
// segments. Placeholders (□, U+25A1) mark editable arguments; insertion
// replaces the first placeholder with the current selection (if any) and
// places the caret there — remaining placeholders stay visible as fill-me
// guides that make incomplete TeX obvious before compilation.

export interface MathSnippet {
  /** Rendered glyph shown in the palette. */
  readonly label: string;
  /** Searchable name, e.g. "integral". */
  readonly name: string;
  /** LaTeX template with □ argument placeholders. */
  readonly latex: string;
}

export interface MathPaletteTab {
  readonly id: string;
  readonly label: string;
  readonly snippets: readonly MathSnippet[];
}

const greek = (latex: string, name: string): MathSnippet => ({
  label: latex.replace("\\", ""),
  name,
  latex,
});

const symbol = (latex: string, label: string, name: string): MathSnippet => ({
  label,
  name,
  latex,
});

export const MATH_PALETTE_TABS: readonly MathPaletteTab[] = [
  {
    id: "builders",
    label: "Builders",
    snippets: [
      { label: "x⁄y", name: "fraction divide", latex: "\\frac{□}{□}" },
      { label: "√", name: "square root", latex: "\\sqrt{□}" },
      { label: "ⁿ√", name: "nth root", latex: "\\sqrt[□]{□}" },
      { label: "x²", name: "superscript power exponent", latex: "^{□}" },
      { label: "x₂", name: "subscript index", latex: "_{□}" },
      { label: "x̄", name: "overline bar", latex: "\\overline{□}" },
      { label: "underline", name: "underline", latex: "\\underline{□}" },
      { label: "text", name: "text words roman", latex: "\\text{□}" },
    ],
  },
  {
    id: "greek",
    label: "Greek",
    snippets: [
      greek("\\alpha", "alpha"),
      greek("\\beta", "beta"),
      greek("\\gamma", "gamma"),
      greek("\\delta", "delta"),
      greek("\\varepsilon", "epsilon varepsilon"),
      greek("\\zeta", "zeta"),
      greek("\\eta", "eta"),
      greek("\\vartheta", "theta vartheta"),
      greek("\\iota", "iota"),
      greek("\\kappa", "kappa"),
      greek("\\lambda", "lambda"),
      greek("\\mu", "mu"),
      greek("\\nu", "nu"),
      greek("\\xi", "xi"),
      greek("\\pi", "pi"),
      greek("\\rho", "rho"),
      greek("\\sigma", "sigma"),
      greek("\\tau", "tau"),
      greek("\\upsilon", "upsilon"),
      greek("\\varphi", "phi varphi"),
      greek("\\chi", "chi"),
      greek("\\psi", "psi"),
      greek("\\omega", "omega"),
      greek("\\Gamma", "Gamma"),
      greek("\\Delta", "Delta"),
      greek("\\Theta", "Theta"),
      greek("\\Lambda", "Lambda"),
      greek("\\Sigma", "Sigma"),
      greek("\\Phi", "Phi"),
      greek("\\Psi", "Psi"),
      greek("\\Omega", "Omega"),
    ],
  },
  {
    id: "big-operators",
    label: "Big operators",
    snippets: [
      { label: "∑", name: "sum summation", latex: "\\sum_{□}^{□}" },
      { label: "∏", name: "product", latex: "\\prod_{□}^{□}" },
      { label: "∫", name: "integral", latex: "\\int_{□}^{□}" },
      { label: "∮", name: "contour integral", latex: "\\oint" },
      { label: "lim", name: "limit", latex: "\\lim_{□}" },
      { label: "⋃", name: "big union", latex: "\\bigcup_{□}" },
      { label: "⋂", name: "big intersection", latex: "\\bigcap_{□}" },
      { label: "max", name: "maximum", latex: "\\max" },
      { label: "min", name: "minimum", latex: "\\min" },
      { label: "sup", name: "supremum", latex: "\\sup" },
      { label: "inf", name: "infimum", latex: "\\inf" },
    ],
  },
  {
    id: "operators",
    label: "Operators",
    snippets: [
      symbol("\\pm", "±", "plus minus"),
      symbol("\\mp", "∓", "minus plus"),
      symbol("\\times", "×", "times multiply"),
      symbol("\\div", "÷", "divide"),
      symbol("\\cdot", "·", "cdot multiply dot"),
      symbol("\\circ", "∘", "compose circle"),
      symbol("\\star", "⋆", "star"),
      symbol("\\oplus", "⊕", "oplus plus circle"),
      symbol("\\otimes", "⊗", "otimes tensor"),
      symbol("\\neq", "≠", "not equal"),
      symbol("\\approx", "≈", "approximately"),
      symbol("\\equiv", "≡", "equivalent identical"),
      symbol("\\leq", "≤", "less or equal"),
      symbol("\\geq", "≥", "greater or equal"),
      symbol("\\ll", "≪", "much less"),
      symbol("\\gg", "≫", "much greater"),
      symbol("\\in", "∈", "element of member"),
      symbol("\\notin", "∉", "not element"),
      symbol("\\ni", "∋", "contains element"),
      symbol("\\subset", "⊂", "subset"),
      symbol("\\subseteq", "⊆", "subset or equal"),
      symbol("\\cup", "∪", "union"),
      symbol("\\cap", "∩", "intersection"),
      symbol("\\setminus", "∖", "set minus difference"),
      symbol("\\emptyset", "∅", "empty set"),
      symbol("\\infty", "∞", "infinity"),
      symbol("\\partial", "∂", "partial derivative"),
      symbol("\\nabla", "∇", "nabla gradient del"),
      symbol("\\mathbb{N}", "ℕ", "natural numbers blackboard"),
      symbol("\\mathbb{Z}", "ℤ", "integers blackboard"),
      symbol("\\mathbb{Q}", "ℚ", "rationals blackboard"),
      symbol("\\mathbb{R}", "ℝ", "reals blackboard"),
      symbol("\\mathbb{C}", "ℂ", "complex blackboard"),
    ],
  },
  {
    id: "arrows-logic",
    label: "Arrows & logic",
    snippets: [
      symbol("\\rightarrow", "→", "right arrow to"),
      symbol("\\leftarrow", "←", "left arrow"),
      symbol("\\Rightarrow", "⇒", "implies right double arrow"),
      symbol("\\Leftarrow", "⇐", "left double arrow"),
      symbol("\\leftrightarrow", "↔", "left right arrow"),
      symbol("\\Leftrightarrow", "⇔", "if and only if iff double arrow"),
      symbol("\\mapsto", "↦", "maps to"),
      symbol("\\uparrow", "↑", "up arrow"),
      symbol("\\downarrow", "↓", "down arrow"),
      symbol("\\therefore", "∴", "therefore"),
      symbol("\\because", "∵", "because since"),
      symbol("\\neg", "¬", "negation not"),
      symbol("\\land", "∧", "and logical conjunction"),
      symbol("\\lor", "∨", "or logical disjunction"),
      symbol("\\forall", "∀", "for all universal"),
      symbol("\\exists", "∃", "there exists existential"),
      symbol("\\nexists", "∄", "not exists"),
      symbol("\\propto", "∝", "proportional to"),
    ],
  },
  {
    id: "accents",
    label: "Accents",
    snippets: [
      { label: "x̂", name: "hat", latex: "\\hat{□}" },
      { label: "x̃", name: "tilde", latex: "\\tilde{□}" },
      { label: "x̄", name: "bar", latex: "\\bar{□}" },
      { label: "x⃗", name: "vector arrow", latex: "\\vec{□}" },
      { label: "ẋ", name: "dot derivative", latex: "\\dot{□}" },
      { label: "ẍ", name: "ddot second derivative", latex: "\\ddot{□}" },
      { label: "widehat", name: "wide hat", latex: "\\widehat{□}" },
      { label: "widetilde", name: "wide tilde", latex: "\\widetilde{□}" },
    ],
  },
  {
    id: "matrices",
    label: "Matrices",
    snippets: [
      {
        label: "( ₂ₓ₂ )",
        name: "pmatrix 2x2 parentheses matrix",
        latex: "\\begin{pmatrix} □ & □ \\\\ □ & □ \\end{pmatrix}",
      },
      {
        label: "[ ₂ₓ₂ ]",
        name: "bmatrix 2x2 brackets matrix",
        latex: "\\begin{bmatrix} □ & □ \\\\ □ & □ \\end{bmatrix}",
      },
      {
        label: "( ₃ₓ₃ )",
        name: "pmatrix 3x3 parentheses matrix",
        latex:
          "\\begin{pmatrix} □ & □ & □ \\\\ □ & □ & □ \\\\ □ & □ & □ \\end{pmatrix}",
      },
      {
        label: "| ₁ₓ₃ |",
        name: "vmatrix row vector determinant",
        latex: "\\begin{vmatrix} □ & □ & □ \\end{vmatrix}",
      },
      {
        label: "cases",
        name: "cases piecewise function",
        latex: "\\begin{cases} □ \\\\ □ \\end{cases}",
      },
    ],
  },
];

export interface MathInsertion {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Insert a LaTeX template into `source`, replacing the first placeholder with
 * the current selection when present. The caret lands on the first remaining
 * insertion point; later placeholders stay visible as fill-me guides.
 */
export function insertMathSnippet(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  latex: string,
): MathInsertion {
  const start = Math.max(0, Math.min(selectionStart, source.length));
  const end = Math.max(start, Math.min(selectionEnd, source.length));
  const selected = source.slice(start, end);
  const firstPlaceholder = latex.indexOf("□");
  let inserted: string;
  let caret: number;
  if (selected && firstPlaceholder >= 0) {
    // Wrap the selection into the first argument; the caret lands right
    // after it and later placeholders stay visible as fill-me guides.
    inserted =
      latex.slice(0, firstPlaceholder) +
      selected +
      latex.slice(firstPlaceholder + 1);
    caret = start + firstPlaceholder + selected.length;
  } else if (firstPlaceholder >= 0) {
    // No selection: remove the first placeholder and put the caret there.
    inserted =
      latex.slice(0, firstPlaceholder) + latex.slice(firstPlaceholder + 1);
    caret = start + firstPlaceholder;
  } else {
    inserted = latex + selected;
    caret = start + inserted.length;
  }
  return {
    text: source.slice(0, start) + inserted + source.slice(end),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

export type MathTokenKind = "command" | "brace" | "script" | "number" | "plain";

export interface MathToken {
  readonly text: string;
  readonly kind: MathTokenKind;
}

/** Tokenize TeX for the highlight overlay (commands, braces, scripts, numbers). */
export function tokenizeMath(source: string): readonly MathToken[] {
  const tokens: MathToken[] = [];
  const pattern = /(\\[a-zA-Z]+|\\.|[{}^_]|[0-9]+(?:\.[0-9]+)?)/gu;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last)
      tokens.push({ text: source.slice(last, index), kind: "plain" });
    const text = match[0];
    const kind: MathTokenKind = text.startsWith("\\")
      ? "command"
      : text === "{" || text === "}"
        ? "brace"
        : text === "^" || text === "_"
          ? "script"
          : "number";
    tokens.push({ text, kind });
    last = index + text.length;
  }
  if (last < source.length)
    tokens.push({ text: source.slice(last), kind: "plain" });
  return tokens;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Render tokens as escaped HTML spans for the highlight layer. */
export function highlightMath(source: string): string {
  if (source === "") return "";
  return tokenizeMath(source)
    .map((token) =>
      token.kind === "plain"
        ? escapeHtml(token.text)
        : `<span class="math-tok-${token.kind}">${escapeHtml(token.text)}</span>`,
    )
    .join("");
}
