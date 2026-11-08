import { describe, expect, it } from "vitest";
import { clearRobotsCache, isAllowed, parseRobots } from "../src/fetch/robots.js";
import { ensureCacheTable, getCacheMeta, putCache, hashBody } from "../src/fetch/cache.js";
import { openMemoryDb } from "../src/memory/db.js";
import { normalizeConfig } from "../src/config/load.js";
import { createFetcher } from "../src/fetch/create.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";

describe("robots + cache", () => {
  it("parses disallow/allow", () => {
    clearRobotsCache();
    const rules = parseRobots(
      `User-agent: *\nDisallow: /private/\nAllow: /catalog\n`,
      "adaparse",
    );
    expect(isAllowed(rules, "https://x.test/catalog")).toBe(true);
    expect(isAllowed(rules, "https://x.test/private/secret")).toBe(false);
  });

  it("blocks private path via PolicyFetcher", async () => {
    clearRobotsCache();
    const config = normalizeConfig({
      site: "robots-test",
      entry: "https://mock.adaparse.local/private/",
      target: { preset: "price_only" },
      fetch: { mode: "http", respect_robots: true, cache: false },
      pagination: { enabled: false, max_pages: 1 },
      heal: { enabled: false, discovery: false, canary: "permissive" },
    });
    const base = new FixtureFetcher({
      "https://mock.adaparse.local/robots.txt": "fixtures/mock-site/robots.txt",
      "https://mock.adaparse.local/private/": "fixtures/mock-site/private.html",
    });
    const fetcher = createFetcher({ config, baseFetcher: base, db: openMemoryDb() });
    const res = await fetcher.fetch("https://mock.adaparse.local/private/");
    expect(res.headers["x-adaparse-robots"]).toBe("blocked");
  });

  it("stores and reuses fetch cache", () => {
    const db = openMemoryDb();
    ensureCacheTable(db);
    putCache(db, "https://x.test/a", {
      url: "https://x.test/a",
      status: 200,
      headers: { etag: "abc" },
      body: "<html>hi</html>",
      finalUrl: "https://x.test/a",
    });
    const meta = getCacheMeta(db, "https://x.test/a");
    expect(meta.entry?.bodyHash).toBe(hashBody("<html>hi</html>"));
    expect(meta.etag).toBe("abc");
  });
});
