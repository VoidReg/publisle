import { afterEach, describe, expect, it, vi } from "vitest";
import { createMermaidFrame } from "../src/mermaid-frame.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function documentStub(render: (source: string, id: string) => Promise<string>) {
  const frames: { remove: ReturnType<typeof vi.fn>; srcdoc: string }[] = [];
  const create = vi.fn(() => {
    let loaded: (() => void) | undefined;
    const frame = {
      title: "",
      tabIndex: 0,
      style: { cssText: "" },
      srcdoc: "",
      contentWindow: { __mermaidReady: Promise.resolve(render) },
      setAttribute: vi.fn(),
      remove: vi.fn(),
      addEventListener: (name: string, callback: () => void) => {
        if (name === "load") loaded = callback;
      },
      load: () => {
        loaded?.();
      },
    };
    frames.push(frame);
    return frame;
  });
  vi.stubGlobal("document", {
    createElement: create,
    body: {
      append: (frame: ReturnType<typeof create>) => {
        frame.load();
      },
    },
  });
  return { create, frames };
}

describe("disposable Mermaid workspace", () => {
  it("reuses a successful module realm and disposes the frame", async () => {
    const render = vi.fn().mockResolvedValue("<svg/>");
    const { create, frames } = documentStub(render);
    const workspace = createMermaidFrame("https://example.test/runtime.js", [
      "renderMermaid",
      "runtimeUrl",
    ]);
    expect(await workspace.render("a", "first")).toBe("<svg/>");
    expect(await workspace.render("b", "second")).toBe("<svg/>");
    expect(create).toHaveBeenCalledTimes(1);
    expect(frames[0]?.srcdoc).toContain("runtime.js");
    workspace.dispose();
    expect(frames[0]?.remove).toHaveBeenCalledOnce();
  });

  it("recreates the realm on failure and preserves cross-window diagnostics", async () => {
    const render = vi
      .fn()
      .mockRejectedValueOnce({ message: "Engine download failed" })
      .mockResolvedValue("<svg/>");
    const { create, frames } = documentStub(render);
    const workspace = createMermaidFrame("https://example.test/runtime.js", [
      "renderMermaid",
    ]);
    await expect(workspace.render("a", "first")).rejects.toThrow(
      "Engine download failed",
    );
    expect(frames[0]?.remove).toHaveBeenCalledOnce();
    expect(await workspace.render("a", "retry")).toBe("<svg/>");
    expect(create).toHaveBeenCalledTimes(2);
    workspace.dispose();
  });

  it("unblocks pending renders when their host is disposed", async () => {
    let finish: ((value: string) => void) | undefined;
    const render = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    documentStub(render);
    const workspace = createMermaidFrame("https://example.test/runtime.js", [
      "renderMermaid",
    ]);
    const pending = workspace.render("a", "pending");
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledOnce();
    });
    const failure = expect(pending).rejects.toThrow("disposed");
    workspace.dispose();
    await failure;
    finish!("<svg/>");
  });
});
