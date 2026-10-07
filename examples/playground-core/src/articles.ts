import source from "../../articles/fourier-series.md?raw";
import figure from "../../articles/fourier-square-wave.svg?url";
import clock from "../../articles/fourier-clock.json?url";

/** Resolve the article's sibling assets to URLs produced by the demo host. */
export const FOURIER_ARTICLE = source
  .replaceAll("./fourier-square-wave.svg", figure)
  .replaceAll("./fourier-clock.json", clock);
