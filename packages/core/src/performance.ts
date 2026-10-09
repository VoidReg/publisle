/** Internal synchronous profiling facility; deliberately absent from the public barrel. */
export interface PhaseTiming {
  calls: number;
  inclusiveMs: number;
  exclusiveMs: number;
}
interface Frame {
  start: number;
  children: number;
}
interface Session {
  phases: Record<string, PhaseTiming>;
  stack: Frame[];
}
let session: Session | undefined;
export function preparationPhase<T>(name: string, run: () => T): T {
  if (!session) return run();
  const active = session;
  const frame = { start: performance.now(), children: 0 };
  active.stack.push(frame);
  try {
    return run();
  } finally {
    const elapsed = performance.now() - frame.start;
    active.stack.pop();
    const parent = active.stack.at(-1);
    if (parent) parent.children += elapsed;
    const timing = (active.phases[name] ??= {
      calls: 0,
      inclusiveMs: 0,
      exclusiveMs: 0,
    });
    timing.calls++;
    timing.inclusiveMs += elapsed;
    timing.exclusiveMs += elapsed - frame.children;
  }
}
export function withPreparationTimings<T>(run: () => T): {
  value: T;
  timings: Record<string, PhaseTiming>;
} {
  const previous = session;
  const current: Session = { phases: {}, stack: [] };
  session = current;
  try {
    const value = preparationPhase(
      "total (exclusive = unattributed overhead)",
      run,
    );
    return { value, timings: current.phases };
  } finally {
    session = previous;
  }
}
