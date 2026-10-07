import { useState } from "react";

export default function Schematic() {
  const [count, setCount] = useState(0);
  return (
    <section aria-label="Interactive schematic">
      <output>{count}</output>
      <button
        onClick={() => {
          setCount((value) => value + 1);
        }}
      >
        Clock
      </button>
      <button
        onClick={() => {
          setCount(0);
        }}
      >
        Reset
      </button>
    </section>
  );
}
