import type { DatabaseSync } from "node:sqlite";
import type { AdaparseConfig, Diagnostic, FetchResponse, Fetcher } from "../types.js";
import { BrowserFetcher } from "./browser.js";
import {
  ensureCacheTable,
  getCacheMeta,
  putCache,
  responseFromCache,
} from "./cache.js";
import { CompositeFetcher, FixtureFetcher } from "./fixture.js";
import { HttpFetcher } from "./http.js";
import { isAllowed, loadRobots } from "./robots.js";
import { PerHostScheduler } from "./scheduler.js";

export interface CreateFetcherOptions {
  config: AdaparseConfig;
  db?: DatabaseSync;
  baseFetcher?: Fetcher;
}

export class PolicyFetcher implements Fetcher {
  readonly diagnostics: Diagnostic[] = [];
  private readonly scheduler: PerHostScheduler;
  private robotsOriginLoaded = new Set<string>();

  constructor(
    private readonly inner: Fetcher,
    private readonly config: AdaparseConfig,
    private readonly db?: DatabaseSync,
  ) {
    this.scheduler = new PerHostScheduler({
      concurrencyPerHost: Math.max(1, Math.min(config.budgets.concurrency, 3)),
      minIntervalMs: 80,
    });
    if (config.fetch.cache && db) ensureCacheTable(db);
  }

  async fetch(url: string, opts?: { timeoutMs?: number }): Promise<FetchResponse> {
    if (this.config.fetch.respectRobots) {
      const origin = new URL(url).origin;
      // Don't recurse PolicyFetcher for robots.txt / robots тянем через inner fetch
      if (!this.robotsOriginLoaded.has(origin)) {
        const rules = await loadRobots(this.inner, origin);
        this.robotsOriginLoaded.add(origin);
        if (rules.crawlDelayMs > 0) {
          this.diagnostics.push({
            level: "info",
            code: "robots_crawl_delay",
            message: `robots crawl-delay ${rules.crawlDelayMs}ms for ${origin}`,
          });
        }
      }
      const rules = await loadRobots(this.inner, origin);
      if (!isAllowed(rules, url)) {
        this.diagnostics.push({
          level: "error",
          code: "robots_blocked",
          message: `URL blocked by robots.txt: ${url}`,
        });
        return {
          url,
          status: 403,
          headers: { "x-adaparse-robots": "blocked" },
          body: "robots_blocked",
          finalUrl: url,
        };
      }
    }

    return this.scheduler.run(url, async () => {
      if (this.config.fetch.cache && this.db) {
        const meta = getCacheMeta(this.db, url);
        // Conditional headers only meaningful for real HTTP; fixtures still benefit from body cache
        if (meta.entry && this.isFixtureLike()) {
          return responseFromCache(url, meta.entry);
        }
      }

      try {
        const res = await this.inner.fetch(url, opts);
        if (res.status === 403 || res.status === 429) {
          this.scheduler.noteBlocked(url);
        }
        if (res.status === 304 && this.db) {
          const meta = getCacheMeta(this.db, url);
          if (meta.entry) return responseFromCache(url, meta.entry);
        }
        if (this.config.fetch.cache && this.db && res.status === 200) {
          putCache(this.db, url, res);
        }
        return res;
      } catch (err) {
        if (String(err).includes("circuit_open")) {
          this.diagnostics.push({
            level: "error",
            code: "circuit_open",
            message: String(err),
          });
        }
        throw err;
      }
    });
  }

  private isFixtureLike(): boolean {
    return Boolean(this.config.fixtures && Object.keys(this.config.fixtures).length);
  }
}

export function createFetcher(opts: CreateFetcherOptions): PolicyFetcher {
  const { config, db } = opts;
  let base = opts.baseFetcher;
  if (!base) {
    if (config.fetch.mode === "browser") {
      base = new BrowserFetcher({
        browser: config.fetch.browser,
        session: config.session,
      });
    } else {
      base = new HttpFetcher({
        concurrency: config.budgets.concurrency,
        defaultTimeoutMs: config.budgets.requestTimeoutMs,
        session: config.session,
      });
    }
    if (config.fixtures && Object.keys(config.fixtures).length) {
      base = new CompositeFetcher(new FixtureFetcher(config.fixtures), base);
    }
  }
  return new PolicyFetcher(base, config, db);
}
