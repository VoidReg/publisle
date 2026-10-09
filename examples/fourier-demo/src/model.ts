/** Host-owned square-wave partial sums. Publisle does not execute this model. */

export const FOURIER_TOLERANCE = 1e-12;
export const FOURIER_TERMS_MIN = 1;
export const FOURIER_TERMS_MAX = 64;

export interface FourierPreset {
  readonly id: string;
  readonly label: string;
  readonly terms: number;
}

export interface FourierPayload {
  readonly terms: number;
  readonly samples: number;
  readonly presets: readonly FourierPreset[];
}

export interface FourierSample {
  readonly x: number;
  readonly partial: number;
  readonly square: number | null;
}

/**
 * (4/pi) * sum_{k=1..terms} sin((2k-1) x) / (2k-1).
 * `terms` counts odd harmonics, not the highest harmonic index.
 */
export function squarePartialSum(terms: number, x: number): number {
  if (
    !Number.isSafeInteger(terms) ||
    terms < FOURIER_TERMS_MIN ||
    terms > FOURIER_TERMS_MAX
  )
    throw new Error(
      `Odd-harmonic count must be an integer from ${String(FOURIER_TERMS_MIN)} through ${String(FOURIER_TERMS_MAX)}.`,
    );
  if (!Number.isFinite(x)) throw new Error("Sample position must be finite.");
  let sum = 0;
  for (let k = 1; k <= terms; k += 1) {
    const harmonic = 2 * k - 1;
    sum += Math.sin(harmonic * x) / harmonic;
  }
  return (4 / Math.PI) * sum;
}

/** Square wave on (-pi, pi): -1, 0 at multiples of pi, otherwise sign(sin x). */
export function squareWave(x: number): number | null {
  if (!Number.isFinite(x)) return null;
  // Authored exact multiples of the same binary64 pi constant are jumps.
  if (Number.isInteger(x / Math.PI)) return 0;
  const wrapped = Math.atan2(Math.sin(x), Math.cos(x));
  if (Object.is(wrapped, 0) || Math.abs(wrapped) === Math.PI) return 0;
  return wrapped > 0 ? 1 : -1;
}

export function withinTolerance(
  actual: number,
  expected: number,
  tolerance = FOURIER_TOLERANCE,
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

export function sampleSeries(
  terms: number,
  samples: number,
): readonly FourierSample[] {
  if (
    !Number.isSafeInteger(samples) ||
    samples < 3 ||
    samples > 65 ||
    samples % 2 === 0
  )
    throw new Error("Sample count must be an odd integer from 3 through 65.");
  const rows: FourierSample[] = [];
  for (let index = 0; index < samples; index += 1) {
    const x = -Math.PI + (2 * Math.PI * index) / (samples - 1);
    rows.push({
      x,
      partial: squarePartialSum(terms, x),
      square: squareWave(x),
    });
  }
  return rows;
}

export function polyline(rows: readonly FourierSample[]): string {
  return rows
    .map((row, index) => {
      const px = (index / Math.max(rows.length - 1, 1)) * 320;
      const py = 80 - (row.partial / 1.5) * 70;
      return `${index === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ");
}
