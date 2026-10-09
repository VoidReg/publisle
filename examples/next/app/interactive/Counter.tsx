"use client";
import { useEffect, useState } from "react";
declare global {
  interface Window {
    __mounts?: number;
    __unmounts?: number;
  }
}
export default function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    window.__mounts = (window.__mounts ?? 0) + 1;
    return () => {
      window.__unmounts = (window.__unmounts ?? 0) + 1;
    };
  }, []);
  return (
    <button
      data-counter
      onClick={() => {
        setCount(count + 1);
      }}
    >
      Count {count}
    </button>
  );
}
