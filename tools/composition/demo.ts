import { build } from "vite";
import { gzipSync } from "node:zlib";
import { compileComposition } from "../../packages/adapter-core/src/composition.ts";
import type { SemanticDeclaration } from "../../packages/schema/src/index.ts";
import fixture from "../../packages/contracts/fixtures/composition.json" with { type: "json" };

/** Host-owned accessible equivalent views. No graph/profile/schema is sent to the reader. */
export async function buildCompositionDemo(): Promise<{
  code: string;
  html: string;
  modules: readonly string[];
  gzipBytes: number;
}> {
  const compiled = compileComposition({
    documentDigest: `sha256:${"a".repeat(64)}`,
    instances: ["source", "target"].map((blockId) => ({
      blockId,
      contractDigest: `sha256:${"b".repeat(64)}`,
      data: fixture.data,
      semantics: fixture.semantics as SemanticDeclaration,
    })),
    connections: [
      {
        from: { block: "source", port: "output" },
        to: { block: "target", port: "input" },
      },
    ],
  });
  const host = `
    for (const root of document.querySelectorAll("[data-placement]")) {
      const placement = createPlacement();
      let saved;
      const status = root.querySelector("[role=status]");
      for (const id of ["source", "target"]) {
        const island = root.querySelector('[data-island="' + id + '"]');
        const display = views => { island.querySelector("output").textContent = String(views.display); };
        display(placement.session(id).views());
        placement.observe(id, display);
      }
      const run = async commands => {
        const errors = await placement.batch(commands);
        status.textContent = errors.length ? errors.map(error => error.message).join("; ") : "Updated";
      };
      root.querySelector("input").addEventListener("input", event => run([{block:"source",kind:"action",id:"set",value:Number(event.target.value)}]));
      root.querySelector("[data-preset]").addEventListener("click", () => run([{block:"source",kind:"preset",id:"high"}]));
      root.querySelector("[data-reset]").addEventListener("click", () => run([{block:"source",kind:"reset",id:"reset"}]));
      root.querySelector("[data-save]").addEventListener("click", () => { saved = placement.session("source").snapshot(); status.textContent = "Snapshot saved"; });
      root.querySelector("[data-restore]").addEventListener("click", () => {
        if(!saved) { status.textContent = "Save a snapshot first"; return; }
        placement.session("source").restore(saved);
        run([{block:"source",kind:"action",id:"set",value:placement.session("source").read().value}]);
      });
      root.querySelector("[data-failure]").addEventListener("click", () => {
        placement.observe("source", async () => { throw Error("Host view failed"); });
        run([{block:"source",kind:"action",id:"set",value:5}]);
      });
      root.querySelector("[data-dispose]").addEventListener("click", () => { placement.dispose(); root.querySelectorAll("button,input").forEach(control => control.disabled = true); status.textContent = "Disposed"; });
    }
  `;
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "host-owned-composition-demo",
        resolveId: (id) =>
          id === "composition-demo" ? "\0composition-demo" : undefined,
        load: (id) =>
          id === "\0composition-demo" ? compiled + host : undefined,
      },
    ],
    build: {
      write: false,
      minify: true,
      rollupOptions: { input: "composition-demo" },
    },
  });
  const built = Array.isArray(result) ? result[0] : result;
  if (!built || !("output" in built))
    throw new Error("Expected finite build output");
  const chunk = built.output.find(
    (entry) => entry.type === "chunk" && entry.isEntry,
  );
  if (chunk?.type !== "chunk") throw new Error("Missing compiled demo entry");
  const html = ["first", "second"]
    .map(
      (
        placement,
      ) => `<article data-placement="${placement}" aria-label="${placement} article">
    <section data-island="source" aria-label="Parameter control">
      <p>Authored fallback: the parameter starts at one; the high preset selects eight.</p>
      <label>Parameter <input type="range" min="0" max="10" value="1"></label>
      <output aria-label="Source value">1</output>
      <button data-preset>High preset</button><button data-reset>Reset</button>
      <button data-save>Save snapshot</button><button data-restore>Restore snapshot</button>
      <button data-failure>Simulate host failure</button><button data-dispose>Dispose</button>
    </section>
    <section data-island="target" aria-label="Related view"><p>Accessible equivalent to a plot: current parameter</p><output aria-label="Related value">1</output></section>
    <p role="status" aria-live="polite">Ready</p>
  </article>`,
    )
    .join("\n");
  return {
    code: chunk.code,
    html,
    modules: Object.keys(chunk.modules),
    gzipBytes: gzipSync(chunk.code).byteLength,
  };
}
