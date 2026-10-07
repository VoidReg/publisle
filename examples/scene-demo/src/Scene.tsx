import { useEffect, useRef } from "react";
import { mountScene } from "./runtime.ts";
import type { ScenePayload } from "./definition.ts";

export default function Scene(payload: ScenePayload) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) return mountScene(host.current, payload);
  }, [payload]);
  return <div ref={host} />;
}
