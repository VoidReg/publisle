/** A disposable module realm makes failed lazy imports retryable without a reload. */
export function createMermaidFrame(
  runtimeUrl: string,
  exports: readonly string[],
): {
  render(source: string, id: string): Promise<string>;
  dispose(): void;
} {
  let frame: HTMLIFrameElement | undefined;
  let ready:
    Promise<(source: string, id: string) => Promise<string>> | undefined;
  let closed: Promise<never> | undefined;
  let cancel: ((error: Error) => void) | undefined;
  const dispose = () => {
    cancel?.(new Error("Diagram rendering workspace was disposed."));
    cancel = undefined;
    closed = undefined;
    frame?.remove();
    frame = undefined;
    ready = undefined;
  };
  return {
    dispose,
    async render(source, id) {
      if (!ready) {
        const next = document.createElement("iframe");
        frame = next;
        closed = new Promise<never>((_resolve, reject) => {
          cancel = reject;
        });
        next.title = "Mermaid rendering workspace";
        next.setAttribute("aria-hidden", "true");
        next.tabIndex = -1;
        // display:none prevents Mermaid from measuring labels correctly.
        next.style.cssText =
          "position:fixed;left:-10000px;top:0;width:1000px;height:800px;visibility:hidden;pointer-events:none;border:0";
        ready = new Promise((resolve, reject) => {
          next.addEventListener(
            "load",
            () => {
              const target = next.contentWindow as
                | (Window & {
                    __mermaidReady?: Promise<
                      (source: string, id: string) => Promise<string>
                    >;
                  })
                | null;
              if (!target?.__mermaidReady) {
                reject(
                  new Error(
                    "Could not initialize the diagram rendering workspace.",
                  ),
                );
                return;
              }
              resolve(target.__mermaidReady);
            },
            { once: true },
          );
          next.addEventListener(
            "error",
            () => {
              reject(
                new Error("Could not load the diagram rendering workspace."),
              );
            },
            { once: true },
          );
        });
        next.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script>window.__mermaidReady=import(${JSON.stringify(runtimeUrl)}).then(module=>{if(!${JSON.stringify(exports)}.every(key=>key in module))throw Error("Incomplete Mermaid runtime module.");return module.renderMermaid;});</script></body></html>`;
        document.body.append(next);
      }
      try {
        const operation = ready.then((render) => render(source, id));
        return await Promise.race([operation, closed!]);
      } catch (error) {
        dispose();
        // Errors from another Window do not satisfy the parent's instanceof Error.
        if (
          error !== null &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        )
          throw new Error(error.message, { cause: error });
        throw error;
      }
    },
  };
}
