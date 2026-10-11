import { defaultFourier } from "@publisle/example-fourier";
import { defaultScene } from "@publisle/example-scene";
import {
  blockLabels,
  blockTypes,
  defaultData as coreDefaultData,
  type PlaygroundExtensions,
} from "@publisle/playground";

export type BlockType =
  | "publisle:paragraph"
  | "publisle:heading"
  | "publisle:list"
  | "publisle:quote"
  | "publisle:code"
  | "publisle:math"
  | "publisle:figure"
  | "publisle:table"
  | "publisle:bibliography"
  | "publisle:callout"
  | "publisle:divider"
  | "publisle:embed"
  | "publisle:diagram"
  | "publisle:raw-html"
  | "publisle:interactive-schematic"
  | "demo:interactive-scene"
  | "demo:fourier-partial-sum";

/** Demo extensions: scene and Fourier example blocks on top of the core set. */
export const DEMO_EXTENSIONS: PlaygroundExtensions = {
  blocks: [
    {
      type: "demo:interactive-scene",
      label: "3D Scene",
      defaultData: defaultScene,
    },
    {
      type: "demo:fourier-partial-sum",
      label: "Fourier partial sums",
      defaultData: defaultFourier,
    },
  ],
};

export const BLOCK_TYPES: readonly BlockType[] = blockTypes(
  DEMO_EXTENSIONS,
) as readonly BlockType[];

export const BLOCK_LABELS: Record<BlockType, string> = blockLabels(
  DEMO_EXTENSIONS,
) as Record<BlockType, string>;

export function defaultData(type: BlockType): unknown {
  return coreDefaultData(type, DEMO_EXTENSIONS);
}
