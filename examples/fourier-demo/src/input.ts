import {
  FOURIER_TERMS_MAX,
  FOURIER_TERMS_MIN,
  type FourierPayload,
  type FourierPreset,
} from "./model.ts";

function fail(path: string, detail: string): never {
  throw new Error(`${path}: ${detail}`);
}

function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(path, `must be an integer from ${String(min)} through ${String(max)}`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    fail(path, "must be a nonempty string");
  return value;
}

export function parseFourierPayload(value: unknown): FourierPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("payload", "must be an object");
  const data = value as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!["terms", "samples", "presets"].includes(key))
      fail(`payload.${key}`, "unsupported field");
  }
  const terms = integer(
    data["terms"],
    "terms",
    FOURIER_TERMS_MIN,
    FOURIER_TERMS_MAX,
  );
  const samples = integer(data["samples"], "samples", 3, 65);
  if (samples % 2 === 0) fail("samples", "must be odd");
  if (!Array.isArray(data["presets"]) || data["presets"].length === 0)
    fail("presets", "must list at least one authored preset");
  const presets: FourierPreset[] = data["presets"].map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      fail(`presets[${String(index)}]`, "must be an object");
    const preset = entry as Record<string, unknown>;
    for (const key of Object.keys(preset)) {
      if (!["id", "label", "terms"].includes(key))
        fail(`presets[${String(index)}].${key}`, "unsupported field");
    }
    return {
      id: text(preset["id"], `presets[${String(index)}].id`),
      label: text(preset["label"], `presets[${String(index)}].label`),
      terms: integer(
        preset["terms"],
        `presets[${String(index)}].terms`,
        FOURIER_TERMS_MIN,
        FOURIER_TERMS_MAX,
      ),
    };
  });
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
    fail("presets", "IDs must be unique");
  if (!presets.some((preset) => preset.terms === terms))
    fail("terms", "must match an authored preset");
  return { terms, samples, presets };
}

/** Island hosts receive the full input; preparation parses the payload alone. */
export function readFourierInput(value: unknown): FourierPayload {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "payload" in value
  )
    return parseFourierPayload(value.payload);
  return parseFourierPayload(value);
}
