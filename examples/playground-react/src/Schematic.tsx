import { useState } from "react";

export default function Schematic() {
  const [count, setCount] = useState(0);
  return (
    <section className="publisle-schematic" aria-label="Interactive schematic">
      <output aria-label="Count">{count}</output>
      <div className="publisle-schematic__controls">
        <button
          type="button"
          onClick={() => {
            setCount((value) => value + 1);
          }}
        >
          Clock
        </button>
        <button
          type="button"
          onClick={() => {
            setCount(0);
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
