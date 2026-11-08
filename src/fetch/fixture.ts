import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { FetchResponse, Fetcher } from "../types.js";

/**
 * Offline URL → HTML/file map for tests and demos.
 * Офлайн-заглушка: URL → HTML или путь к файлу (точное совпадение или суффикс).
 */
export class FixtureFetcher implements Fetcher {
  private readonly map: Map<string, string>;

  constructor(fixtures: Record<string, string>, private readonly baseDir?: string) {
    this.map = new Map(Object.entries(fixtures));
  }

  async fetch(url: string): Promise<FetchResponse> {
    const bodyOrPath = this.lookup(url);
    if (bodyOrPath == null) {
      return {
        url,
        status: 404,
        headers: {},
        body: "Not Found",
        finalUrl: url,
      };
    }

    let body = bodyOrPath;
    if (!bodyOrPath.includes("<") && (bodyOrPath.endsWith(".html") || bodyOrPath.includes("/"))) {
      const path = isAbsolute(bodyOrPath)
        ? bodyOrPath
        : resolve(this.baseDir ?? process.cwd(), bodyOrPath);
      body = readFileSync(path, "utf8");
    }

    return {
      url,
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body,
      finalUrl: url,
    };
  }

  private lookup(url: string): string | undefined {
    if (this.map.has(url)) return this.map.get(url);
    for (const [key, value] of this.map) {
      if (url.endsWith(key) || key.endsWith(url) || url.includes(key)) return value;
    }
    return undefined;
  }
}

/** Fixtures first, then real fetch. / Сначала фикстуры, потом сеть. */
export class CompositeFetcher implements Fetcher {
  constructor(
    private readonly fixture: FixtureFetcher,
    private readonly http: Fetcher,
  ) {}

  async fetch(url: string, opts?: { timeoutMs?: number }): Promise<FetchResponse> {
    const viaFixture = await this.fixture.fetch(url);
    if (viaFixture.status !== 404) return viaFixture;
    return this.http.fetch(url, opts);
  }
}
