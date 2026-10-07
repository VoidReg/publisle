import { describe, expect, it, vi } from "vitest";
import { createIslandController } from "../src/island-runtime.ts";

class ElementStub {
  hidden = false;
  activating = false;
  readonly listeners = new Map<string, (event: Event) => void>();
  closest(selector: string): ElementStub | null {
    return selector === "[data-publisle-activate]" && this.activating
      ? this
      : null;
  }
  addEventListener(name: string, listener: (event: Event) => void): void {
    this.listeners.set(name, listener);
  }
  removeEventListener(name: string): void {
    this.listeners.delete(name);
  }
}

describe("createIslandController", () => {
  it("activates interaction islands from the explicit control", async () => {
    const root = new ElementStub();
    root.hidden = true;
    const fallback = new ElementStub();
    const button = new ElementStub();
    button.activating = true;
    const mount = vi.fn(() => ({ mounted: true }));
    const unmount = vi.fn();
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load: () => Promise.resolve({ default: "component" }),
      mount,
      unmount,
    });
    expect(root.listeners.has("click")).toBe(false);
    const click = fallback.listeners.get("click");
    expect(click).toBeDefined();
    click?.({ target: fallback } as unknown as Event);
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    click?.({ target: button } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(false);
    expect(fallback.hidden).toBe(true);
    controller.destroy();
    expect(unmount).toHaveBeenCalledOnce();
  });
});
