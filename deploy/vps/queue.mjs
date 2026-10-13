import { LIMITS, ServiceError } from "./limits.mjs";

export class Admission {
  active = false;
  pending = [];
  clients = new Map();
  constructor(limits = LIMITS) {
    this.limits = limits;
  }
  async acquire(ip, signal) {
    signal.throwIfAborted();
    const now = Date.now();
    for (const [key, state] of this.clients)
      if (!state.outstanding && state.reset <= now) this.clients.delete(key);
    // Bound quota bookkeeping even during attacks from many distinct addresses.
    if (!this.clients.has(ip) && this.clients.size >= 4096)
      throw new ServiceError("busy", "Service is busy. Try again later.", 429);
    const client = this.clients.get(ip) ?? {
      reset: now + this.limits.quotaMs,
      count: 0,
      outstanding: false,
    };
    if (client.reset <= now) {
      client.reset = now + this.limits.quotaMs;
      client.count = 0;
    }
    if (
      client.outstanding ||
      client.count >= this.limits.attempts ||
      (this.active && this.pending.length >= this.limits.queueSize)
    )
      throw new ServiceError(
        "busy",
        "Compilation limit reached. Try again later.",
        429,
      );
    client.count++;
    client.outstanding = true;
    this.clients.set(ip, client);
    const release = () => {
      client.outstanding = false;
      this.active = false;
      this.pending.shift()?.start();
    };
    if (!this.active) {
      this.active = true;
      return release;
    }
    try {
      await new Promise((resolve, reject) => {
        const remove = (error) => {
          const index = this.pending.indexOf(entry);
          if (index >= 0) this.pending.splice(index, 1);
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(error);
        };
        const abort = () => remove(signal.reason);
        const timer = setTimeout(
          () =>
            remove(
              new ServiceError(
                "queue-timeout",
                "Service is busy. Try again later.",
                429,
              ),
            ),
          this.limits.queueMs,
        );
        const entry = {
          start: () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            this.active = true;
            resolve();
          },
        };
        this.pending.push(entry);
        signal.addEventListener("abort", abort, { once: true });
      });
      return release;
    } catch (error) {
      client.outstanding = false;
      throw error;
    }
  }
}
