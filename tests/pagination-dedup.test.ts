import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { dedupeItems } from "../src/match/dedup.js";
import { openMemoryDb } from "../src/memory/db.js";
import { findNextUrl } from "../src/pagination/walker.js";
import { runJob } from "../src/runner/orchestrator.js";
import { extractFromHtml } from "../src/sources/index.js";
import { PRESETS } from "../src/config/presets.js";
import { scoreAndFilter } from "../src/match/scorer.js";

describe("pagination + dedup", () => {
  it("finds next page from rel=next", () => {
    const html = readFileSync(resolve("fixtures/mock-site/catalog-page1.html"), "utf8");
    const next = findNextUrl(html, "https://mock.adaparse.local/catalog?page=1");
    expect(next).toContain("page=2");
  });

  it("merges pages and dedups Alpha Lamp", async () => {
    const config = normalizeConfig({
      site: "pag-test",
      entry: "https://mock.adaparse.local/catalog?page=1",
      target: { preset: "product_list" },
      heal: { enabled: false, discovery: false, canary: "permissive" },
      pagination: { enabled: true, max_pages: 5 },
      fetch: { mode: "http", respect_robots: false, cache: false },
      budgets: {
        max_pages: 10,
        max_depth: 1,
        concurrency: 1,
        request_timeout_ms: 3000,
        time_budget_ms: 8000,
      },
    });

    const fetcher = new FixtureFetcher({
      "https://mock.adaparse.local/catalog?page=1": "fixtures/mock-site/catalog-page1.html",
      "https://mock.adaparse.local/catalog?page=2": "fixtures/mock-site/catalog-page2.html",
    });

    const result = await runJob({
      config,
      fetcher,
      db: openMemoryDb(),
      log: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.meta.pagesFetched).toBeGreaterThanOrEqual(2);
    const titles = result.items.map((i) => i.title);
    expect(titles).toContain("Alpha Lamp");
    expect(titles).toContain("Gamma Desk");
    expect(titles.filter((t) => t === "Alpha Lamp").length).toBe(1);
  });

  it("dedupeItems keeps higher score", () => {
    const html = readFileSync(resolve("fixtures/mock-site/catalog-page1.html"), "utf8");
    const a = extractFromHtml(
      html,
      "https://mock.adaparse.local/catalog?page=1",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    const { items } = scoreAndFilter(a, PRESETS.product_list.defaultFields);
    const duped = dedupeItems([...items, ...items]);
    expect(duped.length).toBe(items.length);
  });
});
