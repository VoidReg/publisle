export type InlineNode =
  | { readonly type: "text"; readonly value: string }
  | {
      readonly type: "emphasis" | "strong" | "delete";
      readonly children: readonly InlineNode[];
    }
  | { readonly type: "inlineCode"; readonly value: string }
  | { readonly type: "math"; readonly value: string }
  | {
      readonly type: "link";
      readonly url: string;
      readonly title?: string;
      readonly children: readonly InlineNode[];
    }
  | {
      readonly type: "image";
      readonly url: string;
      readonly alt: string;
      readonly title?: string;
    }
  | { readonly type: "break" }
  | { readonly type: "footnoteReference"; readonly identifier: string }
  | { readonly type: "rawHtml"; readonly value: string };

export type FlowNode =
  | { readonly type: "paragraph"; readonly content: readonly InlineNode[] }
  | {
      readonly type: "heading";
      readonly level: number;
      readonly content: readonly InlineNode[];
    }
  | { readonly type: "quote"; readonly children: readonly FlowNode[] }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly start?: number;
      readonly items: readonly ListItemData[];
    }
  | {
      readonly type: "code";
      readonly value: string;
      readonly language?: string;
      readonly meta?: string;
    }
  | { readonly type: "divider" }
  | { readonly type: "rawHtml"; readonly value: string };

export interface ParagraphData {
  readonly content: readonly InlineNode[];
}
export interface HeadingData {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly content: readonly InlineNode[];
}
export interface ListItemData {
  readonly checked?: boolean;
  readonly children: readonly FlowNode[];
}
export interface ListData {
  readonly ordered: boolean;
  readonly start?: number;
  readonly items: readonly ListItemData[];
}
export interface QuoteData {
  readonly children: readonly FlowNode[];
}
export interface CodeData {
  readonly value: string;
  readonly language?: string;
  readonly meta?: string;
}
export interface MathData {
  readonly value: string;
  readonly display: boolean;
}
export interface FigureData {
  readonly src: string;
  readonly alt: string;
  readonly title?: string;
  readonly caption?: readonly InlineNode[];
}
export interface TableData {
  readonly align: readonly ("left" | "right" | "center" | null)[];
  readonly rows: readonly (readonly (readonly InlineNode[])[])[];
}
export interface CalloutData {
  readonly variant: string;
  readonly title?: string;
  readonly children: readonly FlowNode[];
}
export interface FootnoteData {
  readonly identifier: string;
  readonly children: readonly FlowNode[];
}
export interface RawHtmlData {
  readonly value: string;
  readonly inline: boolean;
}
