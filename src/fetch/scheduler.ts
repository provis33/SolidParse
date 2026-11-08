export interface HostSchedulerOptions {
  concurrencyPerHost?: number;
  minIntervalMs?: number;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
}

interface HostState {
  active: number;
  queue: Array<() => void>;
  lastAt: number;
  failures: number;
  openUntil: number;
}

/**
 * Per-host concurrency, jitter, and trip on repeated 403/429.
 * Очередь по хосту + паузы; при серии 403/429 временно стопаемся.
 */
export class PerHostScheduler {
  private readonly hosts = new Map<string, HostState>();
  private readonly concurrencyPerHost: number;
  private readonly minIntervalMs: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitOpenMs: number;

  constructor(opts: HostSchedulerOptions = {}) {
    this.concurrencyPerHost = opts.concurrencyPerHost ?? 2;
    this.minIntervalMs = opts.minIntervalMs ?? 100;
    this.circuitFailureThreshold = opts.circuitFailureThreshold ?? 3;
    this.circuitOpenMs = opts.circuitOpenMs ?? 30_000;
  }

  async run<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const host = hostOf(url);
    const state = this.state(host);
    if (Date.now() < state.openUntil) {
      throw new Error(`circuit_open:${host}`);
    }
    await this.acquire(state);
    try {
      const wait = Math.max(0, state.lastAt + this.minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait + Math.floor(Math.random() * 40));
      state.lastAt = Date.now();
      const result = await fn();
      state.failures = 0;
      return result;
    } catch (err) {
      throw err;
    } finally {
      this.release(state);
    }
  }

  noteBlocked(url: string): void {
    const state = this.state(hostOf(url));
    state.failures++;
    if (state.failures >= this.circuitFailureThreshold) {
      state.openUntil = Date.now() + this.circuitOpenMs;
      state.failures = 0;
    }
  }

  private state(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = { active: 0, queue: [], lastAt: 0, failures: 0, openUntil: 0 };
      this.hosts.set(host, s);
    }
    return s;
  }

  private acquire(state: HostState): Promise<void> {
    if (state.active < this.concurrencyPerHost) {
      state.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      state.queue.push(() => {
        state.active++;
        resolve();
      });
    });
  }

  private release(state: HostState): void {
    state.active--;
    const next = state.queue.shift();
    if (next) next();
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
