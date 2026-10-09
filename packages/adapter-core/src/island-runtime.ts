import type { Activation, JsonValue } from "@publisle/schema";

export interface IslandMountOptions {
  readonly root: HTMLElement;
  readonly fallback: HTMLElement;
  readonly activation: Activation;
  readonly load: (signal: AbortSignal) => Promise<unknown>;
  readonly mount: (
    module: unknown,
    root: HTMLElement,
    props: JsonValue,
  ) => unknown;
  readonly unmount: (instance: unknown) => void;
  readonly props: JsonValue;
  readonly scope?: HTMLElement;
  /** Off by default. When set, leaving the viewport unmounts and re-entry mounts again. */
  readonly suspend?: boolean;
  readonly onError?: (error: unknown) => void;
}

export interface IslandController {
  activate(): Promise<void>;
  destroy(): void;
}

function reducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canFocus(value: unknown): value is HTMLElement {
  return (
    value !== null &&
    typeof value === "object" &&
    "focus" in value &&
    typeof (value as { focus?: unknown }).focus === "function"
  );
}

function activateControl(scope: HTMLElement): HTMLElement | null {
  const control = scope.querySelector?.("[data-publisle-activate]");
  return canFocus(control) ? control : null;
}

function retainFocus(
  scope: HTMLElement,
  root: HTMLElement,
  fallback: HTMLElement,
): void {
  const active = scope.ownerDocument?.activeElement;
  if (!active) return;
  const control = activateControl(scope);
  const insideFallback =
    typeof fallback.contains === "function" && fallback.contains(active);
  if (active !== control && !insideFallback) return;
  if (typeof root.hasAttribute === "function" && !root.hasAttribute("tabindex"))
    root.setAttribute("tabindex", "-1");
  root.focus?.();
}

export function createIslandController(
  options: IslandMountOptions,
): IslandController {
  let instance: unknown;
  let mounted = false;
  let pending: Promise<void> | undefined;
  let destroyed = false;
  let generation = 0;
  let abort: AbortController | undefined;
  let cleanup = (): void => undefined;
  const scope = options.scope ?? options.fallback;

  const release = (): void => {
    if (!mounted) return;
    mounted = false;
    try {
      options.unmount(instance);
    } finally {
      instance = undefined;
      options.root.hidden = true;
      options.fallback.hidden = false;
    }
  };

  const activate = (): Promise<void> => {
    if (destroyed || mounted) return Promise.resolve();
    if (pending) return pending;
    const current = ++generation;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    scope.setAttribute?.("aria-busy", "true");
    pending = (async () => {
      try {
        const module = await options.load(signal);
        if (destroyed || signal.aborted || current !== generation) return;
        instance = options.mount(module, options.root, options.props);
        if (destroyed || signal.aborted || current !== generation) {
          options.unmount(instance);
          instance = undefined;
          return;
        }
        mounted = true;
        if (!options.suspend) cleanup();
        options.root.hidden = false;
        options.fallback.hidden = true;
        scope.setAttribute?.("aria-busy", "false");
        scope.setAttribute?.("data-publisle-status", "ready");
        retainFocus(scope, options.root, options.fallback);
      } catch (error) {
        if (destroyed || signal.aborted || current !== generation) return;
        scope.setAttribute?.("aria-busy", "false");
        scope.setAttribute?.("data-publisle-status", "failed");
        options.root.hidden = true;
        options.fallback.hidden = false;
        activateControl(scope)?.focus?.();
        options.onError?.(error);
      }
    })().finally(() => {
      if (current === generation) pending = undefined;
    });
    return pending;
  };

  if (
    options.activation === "load" ||
    (options.activation === "idle" && reducedMotion())
  )
    void activate();
  else if (
    options.activation === "visible" &&
    "IntersectionObserver" in globalThis
  ) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some(({ isIntersecting }) => isIntersecting);
      if (visible) void activate();
      else if (options.suspend) {
        generation += 1;
        abort?.abort();
        pending = undefined;
        scope.setAttribute?.("aria-busy", "false");
        release();
      }
      if (visible && !options.suspend) observer.disconnect();
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
      if (event.type === "keydown") {
        const key = "key" in event ? String(event.key) : "";
        if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
        if (key === " " || key === "Spacebar") event.preventDefault?.();
      }
      void activate();
    };
    scope.addEventListener("click", handler);
    scope.addEventListener("keydown", handler);
    cleanup = () => {
      scope.removeEventListener("click", handler);
      scope.removeEventListener("keydown", handler);
    };
  }

  return {
    activate,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      abort?.abort();
      cleanup();
      release();
      scope.removeAttribute?.("aria-busy");
    },
  };
}
