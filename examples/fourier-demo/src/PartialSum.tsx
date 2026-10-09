import { useState } from "react";
import { readFourierInput } from "./input.ts";
import { polyline, sampleSeries, type FourierPayload } from "./model.ts";

function format(value: number): string {
  if (Object.is(value, 0) || Math.abs(value) < 1e-12) return "0";
  return value.toFixed(6);
}

export default function PartialSum(input: { payload: FourierPayload }) {
  const payload = readFourierInput(input);
  const [terms, setTerms] = useState(payload.terms);
  const rows = sampleSeries(terms, payload.samples);
  return (
    <section aria-label="Square-wave partial sums">
      <div role="group" aria-label="Harmonic count">
        {payload.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.terms === terms}
            onClick={() => {
              setTerms(preset.terms);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite">
        {terms} odd harmonics selected
      </p>
      <svg
        viewBox="0 0 320 160"
        role="img"
        aria-label={`${String(terms)} odd harmonics`}
      >
        <path
          d={polyline(rows)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <table>
        <caption>Partial-sum samples for {terms} odd harmonics</caption>
        <thead>
          <tr>
            <th scope="col">x</th>
            <th scope="col">Partial sum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.x}>
              <td>{format(row.x)}</td>
              <td>{format(row.partial)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
