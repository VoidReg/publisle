import { attachPublication } from "../../../packages/adapter-core/src/publication-runtime.ts";
import type { PublicationReaderManifest } from "../../../packages/adapter-core/src/publication.ts";
import type { IslandInput } from "../../../packages/schema/src/island-input.ts";

// The host owns the allowlist. The article cannot supply import paths.
const implementations = {
  "host:counter": () => import("./counter.ts"),
  "host:missing": () => {
    const path = "/missing-implementation.js";
    return import(/* @vite-ignore */ path) as Promise<unknown>;
  },
};

const manifest = await fetch("/publication.json").then((response) => {
  if (!response.ok) throw new Error("Missing compiled attachment manifest");
  return response.json() as Promise<PublicationReaderManifest>;
});

for (const root of document.querySelectorAll<HTMLElement>(
  "[data-publisle-root]",
)) {
  attachPublication(root, manifest, {
    implementations,
    mount: (module, target, props) => {
      // This boundary accepts only host-approved modules and compiler-made inputs.
      const implementation = module as {
        mount: (target: HTMLElement, input: IslandInput) => () => void;
      };
      return implementation.mount(target, props as unknown as IslandInput);
    },
    unmount: (instance) => {
      (instance as () => void)();
    },
  });
}
