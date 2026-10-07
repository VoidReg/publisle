import { createBlock } from "@publisle/schema";
import type { BlockFromDefinition } from "@publisle/schema";
import {
  calloutDefinition,
  codeDefinition,
  dividerDefinition,
  figureDefinition,
  headingDefinition,
  listDefinition,
  mathDefinition,
  paragraphDefinition,
  quoteDefinition,
  tableDefinition,
} from "./definitions.ts";
import type {
  CalloutData,
  CodeData,
  FigureData,
  HeadingData,
  ListData,
  MathData,
  ParagraphData,
  QuoteData,
  TableData,
} from "./types.ts";

const make = <
  D,
  Def extends { type: `${string}:${string}`; schemaVersion: number },
>(
  definition: Def,
  data: D,
): BlockFromDefinition<Def> =>
  createBlock({
    type: definition.type,
    schemaVersion: definition.schemaVersion,
    data,
  }) as BlockFromDefinition<Def>;
export const paragraph = (data: ParagraphData) =>
  make(paragraphDefinition, data);
export const heading = (data: HeadingData) => make(headingDefinition, data);
export const list = (data: ListData) => make(listDefinition, data);
export const quote = (data: QuoteData) => make(quoteDefinition, data);
export const code = (data: CodeData) => make(codeDefinition, data);
export const math = (data: MathData) => make(mathDefinition, data);
export const figure = (data: FigureData) => make(figureDefinition, data);
export const table = (data: TableData) => make(tableDefinition, data);
export const callout = (data: CalloutData) => make(calloutDefinition, data);
export const divider = () => make(dividerDefinition, {});
