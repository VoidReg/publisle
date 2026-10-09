import { describe, expect, it, vi } from "vitest";
import { createIslandController } from "../src/island-runtime.ts";

class ElementStub {
  hidden = false;
  activating = false;
  focused = false;
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, (event: Event) => void>();
  readonly children: ElementStub[] = [];
  ownerDocument = { activeElement: undefined as ElementStub | undefined };
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
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  focus(): void {
    this.focused = true;
    this.ownerDocument.activeElement = this;
  }
  contains(value: unknown): boolean {
    return this.children.includes(value as ElementStub);
  }
  querySelector(selector: string): ElementStub | null {
    return (
      this.children.find((child) => child.matches(selector)) ??
      this.children
        .map((child) => child.querySelector(selector))
        .find((child) => child !== null) ??
      null
    );
  }
  matches(selector: string): boolean {
    return selector === "[data-publisle-activate]" && this.activating;
  }
  append(child: ElementStub): void {
    this.children.push(child);
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

  it("activates from Enter or Space and does not replay the key as a semantic action", async () => {
    const root = new ElementStub();
    root.hidden = true;
    const fallback = new ElementStub();
    const button = new ElementStub();
    button.activating = true;
    fallback.append(button);
    const mount = vi.fn(() => ({ mounted: true }));
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: { action: "none" },
      load: () => Promise.resolve({}),
      mount,
      unmount: vi.fn(),
    });
    const keydown = fallback.listeners.get("keydown");
    keydown?.({
      type: "keydown",
      key: "Escape",
      target: button,
      preventDefault: vi.fn(),
    } as unknown as Event);
    await Promise.resolve();
    expect(mount).not.toHaveBeenCalled();
    const preventDefault = vi.fn();
    keydown?.({
      type: "keydown",
      key: " ",
      target: button,
      preventDefault,
    } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      action: "none",
    });
    controller.destroy();
  });

  it("does not mount a load that finishes after destroy", async () => {
    const root = new ElementStub();
    const fallback = new ElementStub();
    let resolve: (value: unknown) => void = () => undefined;
    const mount = vi.fn(() => ({ mounted: true }));
    const unmount = vi.fn();
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load: (signal) =>
        new Promise((done, reject) => {
          resolve = done;
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      mount,
      unmount,
      onError: vi.fn(),
    });
    const pending = controller.activate();
    controller.destroy();
    resolve({ default: "late" });
    await pending;
    expect(mount).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();
  });

  it("keeps the fallback focused when activation fails", async () => {
    const root = new ElementStub();
    root.hidden = true;
    const fallback = new ElementStub();
    const button = new ElementStub();
    button.activating = true;
    fallback.append(button);
    fallback.ownerDocument = button.ownerDocument;
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load: () => Promise.reject(new Error("missing")),
      mount: vi.fn(),
      unmount: vi.fn(),
      onError: vi.fn(),
    });
    await controller.activate();
    expect(fallback.hidden).toBe(false);
    expect(button.focused).toBe(true);
    expect(fallback.attrs.get("data-publisle-status")).toBe("failed");
    controller.destroy();
  });

  it("suspends an opted-in island when it leaves the viewport", async () => {
    const root = new ElementStub();
    const fallback = new ElementStub();
    let observe: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    class ObserverStub {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observe = callback;
      }
      observe(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    }
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    const mount = vi.fn(() => ({ mounted: true }));
    const unmount = vi.fn();
    const controller = createIslandController({
      root: root as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "visible",
      suspend: true,
      props: {},
      load: () => Promise.resolve({}),
      mount,
      unmount,
    });
    observe?.([{ isIntersecting: true }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledOnce();
    observe?.([{ isIntersecting: false }]);
    expect(unmount).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
    observe?.([{ isIntersecting: true }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(mount).toHaveBeenCalledTimes(2);
    controller.destroy();
    vi.unstubAllGlobals();
  });

  it("keeps interaction controls available for a failed-load retry", async () => {
    const fallback = new ElementStub();
    const button = new ElementStub();
    button.activating = true;
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const mount = vi.fn();
    const controller = createIslandController({
      root: new ElementStub() as unknown as HTMLElement,
      fallback: fallback as unknown as HTMLElement,
      activation: "interaction",
      props: {},
      load,
      mount,
      unmount: vi.fn(),
    });
    fallback.listeners.get("click")?.({ target: button } as unknown as Event);
    await controller.activate();
    expect(fallback.listeners.has("click")).toBe(true);
    fallback.listeners.get("click")?.({ target: button } as unknown as Event);
    await controller.activate();
    expect(load).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledOnce();
    expect(fallback.listeners.has("click")).toBe(false);
    controller.destroy();
  });

  it("cancels a pending suspended load and ignores a stale module on re-entry", async () => {
    let observe: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof observe) {
          observe = callback;
        }
        observe() {
          /* Test drives observer delivery. */
        }
        disconnect() {
          /* No browser resources in this stub. */
        }
      },
    );
    const resolves: ((value: unknown) => void)[] = [];
    const signals: AbortSignal[] = [];
    const mount = vi.fn();
    const controller = createIslandController({
      root: new ElementStub() as unknown as HTMLElement,
      fallback: new ElementStub() as unknown as HTMLElement,
      activation: "visible",
      suspend: true,
      props: {},
      load: (signal) => {
        signals.push(signal);
        return new Promise((resolve) => resolves.push(resolve));
      },
      mount,
      unmount: vi.fn(),
    });
    try {
      observe?.([{ isIntersecting: true }]);
      observe?.([{ isIntersecting: false }]);
      expect(signals[0]?.aborted).toBe(true);
      observe?.([{ isIntersecting: true }]);
      resolves[0]?.({ stale: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(mount).not.toHaveBeenCalled();
      resolves[1]?.({ current: true });
      await controller.activate();
      expect(mount).toHaveBeenCalledOnce();
    } finally {
      controller.destroy();
      vi.unstubAllGlobals();
    }
  });

  it("activates an idle island immediately when reduced motion is requested", async () => {
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
    }));
    const mount = vi.fn(() => ({ mounted: true }));
    const controller = createIslandController({
      root: new ElementStub() as unknown as HTMLElement,
      fallback: new ElementStub() as unknown as HTMLElement,
      activation: "idle",
      props: {},
      load: () => Promise.resolve({}),
      mount,
      unmount: vi.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(idle).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledOnce();
    controller.destroy();
    vi.unstubAllGlobals();
  });
});
