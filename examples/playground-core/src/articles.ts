import partialSums from "../../articles/fourier-partial-sums.md?raw";
import source from "../../articles/fourier-series.md?raw";
import researchSource from "../../articles/interactive-research-paper.md?raw";
import figure from "../../articles/fourier-square-wave.svg?url";
import paperFigure from "../../articles/paper-convergence.png?url";
import clock from "../../articles/fourier-clock.json?url";

/** Resolve the article's sibling assets to URLs produced by the demo host. */
export const FOURIER_PARTIAL_SUMS = partialSums;

export const FOURIER_ARTICLE = source
  .replaceAll("./fourier-square-wave.svg", figure)
  .replaceAll("./fourier-clock.json", clock);

export const RESEARCH_PAPER = researchSource
  .replaceAll("./paper-convergence.png", paperFigure)
  .replaceAll("./fourier-clock.json", clock);
