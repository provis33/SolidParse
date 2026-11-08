import type { FetchResponse, Fetcher, SessionConfig } from "../types.js";
import { resolveSession } from "./session.js";

export interface HttpFetcherOptions {
  userAgent?: string;
  maxRetries?: number;
  concurrency?: number;
  defaultTimeoutMs?: number;
  session?: SessionConfig;
}

const DEFAULT_UA =
  "adaparse/0.1 (+https://github.com/adaparse/adaparse; responsible self-host extractor)";

export class HttpFetcher implements Fetcher {
  private readonly ua: string;
  private readonly maxRetries: number;
  private readonly defaultTimeoutMs: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private readonly concurrency: number;
  private readonly session?: SessionConfig;

  constructor(opts: HttpFetcherOptions = {}) {
    this.ua = opts.userAgent ?? DEFAULT_UA;
    this.maxRetries = opts.maxRetries ?? 3;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 20_000;
    this.concurrency = opts.concurrency ?? 3;
    this.session = opts.session;
  }

  async fetch(url: string, opts?: { timeoutMs?: number }): Promise<FetchResponse> {
    await this.acquire();
    try {
      return await this.fetchWithRetry(url, opts?.timeoutMs ?? this.defaultTimeoutMs);
    } finally {
      this.release();
    }
  }

  private async fetchWithRetry(url: string, timeoutMs: number): Promise<FetchResponse> {
    let lastErr: unknown;
    const resolved = resolveSession(this.session);
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
              "user-agent": this.ua,
              accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              ...resolved.headers,
            },
          });
          const body = await res.text();
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          return {
            url,
            status: res.status,
            headers,
            body,
            finalUrl: res.url || url,
          };
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) {
          const delay = Math.min(2000, 200 * 2 ** attempt) + Math.floor(Math.random() * 100);
          await sleep(delay);
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
