import type { BrowserFetchConfig, FetchResponse, Fetcher, SessionConfig } from "../types.js";
import { resolveSession } from "./session.js";

interface PlaywrightModule {
  chromium: {
    launch: (o?: object) => Promise<BrowserLike>;
  };
}

interface BrowserLike {
  newContext(opts?: object): Promise<BrowserContextLike>;
  close(): Promise<void>;
}

interface BrowserContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

interface PageLike {
  goto(
    url: string,
    opts: { waitUntil: string; timeout: number },
  ): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  waitForSelector(sel: string, opts?: { timeout?: number }): Promise<unknown>;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  click(sel: string, opts?: { timeout?: number }): Promise<void>;
  on(event: string, handler: (res: NetworkResponseLike) => void): void;
}

interface NetworkResponseLike {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
  request(): { resourceType(): string };
}

export interface BrowserFetcherOptions {
  browser?: BrowserFetchConfig;
  session?: SessionConfig;
}

const DEFAULT_BROWSER: BrowserFetchConfig = {
  waitUntil: "domcontentloaded",
  maxScrolls: 0,
  loadMoreSelectors: [],
  captureNetworkJson: true,
};

/**
 * Optional Playwright fetch: wait modes, scroll, load-more, JSON sniff.
 * Опциональный браузерный fetch (peer dep). Без playwright HTTP-режим жив.
 */
export class BrowserFetcher implements Fetcher {
  private readonly browserCfg: BrowserFetchConfig;
  private readonly session?: SessionConfig;

  constructor(opts: BrowserFetcherOptions = {}) {
    this.browserCfg = { ...DEFAULT_BROWSER, ...opts.browser };
    this.session = opts.session;
  }

  async fetch(url: string, opts?: { timeoutMs?: number }): Promise<FetchResponse> {
    let playwright: PlaywrightModule;
    try {
      const mod = await import(/* webpackIgnore: true */ "playwright" as string);
      playwright = mod as unknown as PlaywrightModule;
    } catch {
      throw new Error(
        "BrowserFetcher requires optional peer dependency `playwright`. Install with: npm i playwright && npx playwright install chromium",
      );
    }

    const timeout = opts?.timeoutMs ?? 30_000;
    const resolved = resolveSession(this.session);
    const networkJson: unknown[] = [];

    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const contextOpts: Record<string, unknown> = {};
      if (resolved.storageStateJson) {
        contextOpts.storageState = resolved.storageStateJson;
      } else if (resolved.storageStatePath) {
        contextOpts.storageState = resolved.storageStatePath;
      }
      if (resolved.headers["user-agent"]) {
        contextOpts.userAgent = resolved.headers["user-agent"];
      }
      const context = await browser.newContext(contextOpts);
      try {
        const page = await context.newPage();

        if (this.browserCfg.captureNetworkJson) {
          page.on("response", (res) => {
            void captureJson(res, networkJson);
          });
        }

        const waitUntil = this.browserCfg.waitUntil;
        const res = await page.goto(url, { waitUntil, timeout });

        if (this.browserCfg.waitFor) {
          await page.waitForSelector(this.browserCfg.waitFor, { timeout });
        }

        for (let i = 0; i < this.browserCfg.maxScrolls; i++) {
          await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
          await sleep(400);
        }

        for (const sel of this.browserCfg.loadMoreSelectors) {
          try {
            await page.click(sel, { timeout: 3000 });
            await sleep(500);
          } catch {
            /* selector missing — skip */
          }
        }

        const body = await page.content();
        const status = res?.status() ?? 200;
        const finalUrl = page.url();
        return {
          url,
          status,
          headers: { "content-type": "text/html" },
          body,
          finalUrl,
          networkJson: networkJson.length ? networkJson : undefined,
        };
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
}

async function captureJson(res: NetworkResponseLike, out: unknown[]): Promise<void> {
  try {
    const type = res.request().resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("json") && !res.url().includes(".json")) return;
    if (res.status() < 200 || res.status() >= 300) return;
    if (out.length >= 30) return;
    const text = await res.text();
    if (text.length > 2_000_000) return;
    out.push(JSON.parse(text));
  } catch {
    /* ignore non-json */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Test helper without Chromium / хелпер тестов без Playwright */
export function withNetworkJson(res: FetchResponse, payloads: unknown[]): FetchResponse {
  return { ...res, networkJson: payloads };
}
