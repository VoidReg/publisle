import type { Activation, JsonValue } from "@publisle/schema";

export interface IslandMountOptions {
  readonly root: HTMLElement;
  readonly fallback: HTMLElement;
  readonly activation: Activation;
  readonly load: () => Promise<unknown>;
  readonly mount: (
    module: unknown,
    root: HTMLElement,
    props: JsonValue,
  ) => unknown;
  readonly unmount: (instance: unknown) => void;
  readonly props: JsonValue;
  readonly scope?: HTMLElement;
  readonly onError?: (error: unknown) => void;
}

export interface IslandController {
  activate(): Promise<void>;
  destroy(): void;
}

export function createIslandController(
  options: IslandMountOptions,
): IslandController {
  let instance: unknown;
  let destroyed = false;
  let cleanup = (): void => undefined;
  const scope = options.scope ?? options.fallback;
  const activate = async (): Promise<void> => {
    if (destroyed || instance !== undefined) return;
    try {
      const module = await options.load();
      if (destroyed) return;
      instance = options.mount(module, options.root, options.props);
      options.root.hidden = false;
      options.fallback.hidden = true;
    } catch (error) {
      options.onError?.(error);
    }
  };
  if (options.activation === "load") void activate();
  else if (
    options.activation === "visible" &&
    "IntersectionObserver" in globalThis
  ) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        observer.disconnect();
        void activate();
      }
    });
    observer.observe(scope);
    cleanup = () => observer.disconnect();
  } else if (options.activation === "visible") {
    void activate();
  } else if (
    options.activation === "idle" &&
    "requestIdleCallback" in globalThis
  ) {
    const id = requestIdleCallback(() => void activate());
    cleanup = () => cancelIdleCallback(id);
  } else if (options.activation === "idle") {
    const id = globalThis.setTimeout(() => void activate(), 0);
    cleanup = () => globalThis.clearTimeout(id);
  } else {
    const handler = (event: Event): void => {
      const target = event.target as {
        closest?: (selector: string) => unknown;
      } | null;
      if (
        !target ||
        typeof target.closest !== "function" ||
        target.closest("[data-publisle-activate]") === null
      )
        return;
      scope.removeEventListener("click", handler);
      void activate();
    };
    scope.addEventListener("click", handler);
    cleanup = () => scope.removeEventListener("click", handler);
  }
  return {
    activate,
    destroy() {
      destroyed = true;
      cleanup();
      if (instance !== undefined) options.unmount(instance);
    },
  };
}
