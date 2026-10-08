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
  it("coalesces overlapping activation and destroys a mounted instance only once", async () => {
    const root = new ElementStub();
    const fallback = new ElementStub();
    let resolve: (value: unknown) => void = () => undefined;
    const loaded = new Promise<unknown>((done) => {
      resolve = done;
    });
    const load = vi.fn(() => loaded);
    const mount = vi.fn(() => ({ instance: true }));
    const unmount = vi.fn();
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load,
      mount,
      unmount,
    });
    const first = controller.activate();
    const second = controller.activate();
    resolve({ default: "component" });
    await Promise.all([first, second]);
    expect(load).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledOnce();
    controller.destroy();
    controller.destroy();
    expect(unmount).toHaveBeenCalledOnce();
  });

  it("tracks successful mounts even when a host returns an undefined instance", async () => {
    const mount = vi.fn(() => undefined);
    const unmount = vi.fn();
    const controller = createIslandController({
      root: new ElementStub() as unknown as HTMLElement,
      fallback: new ElementStub() as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load: () => Promise.resolve({}),
      mount,
      unmount,
    });
    await controller.activate();
    await controller.activate();
    controller.destroy();
    expect(mount).toHaveBeenCalledOnce();
    expect(unmount).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("retains fallback and reports failed activation", async () => {
    const root = new ElementStub();
    root.hidden = true;
    const fallback = new ElementStub();
    const error = new Error("Module unavailable");
    const onError = vi.fn();
    const mount = vi.fn();
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load: () => Promise.reject(error),
      mount,
      unmount: vi.fn(),
      onError,
    });
    await controller.activate();
    expect(mount).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(root.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
    controller.destroy();
  });

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
