import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { openMemoryDb } from "../src/memory/db.js";
import { runJob } from "../src/runner/orchestrator.js";

describe("discovery", () => {
  it("finds moved catalog via limited BFS", async () => {
    const moved = readFileSync(resolve("fixtures/html/D_moved_entry.html"), "utf8");
    const neu = readFileSync(resolve("fixtures/html/D_new_catalog.html"), "utf8");

    const config = normalizeConfig({
      site: "discovery-test",
      entry: "https://fixtures.adaparse.local/catalog",
      target: { preset: "product_list" },
      heal: { enabled: true, discovery: true, canary: "permissive" },
      budgets: {
        max_pages: 10,
        max_depth: 2,
        concurrency: 2,
        request_timeout_ms: 3000,
        time_budget_ms: 10000,
      },
    });

    const fetcher = new FixtureFetcher({
      "https://fixtures.adaparse.local/catalog": moved,
      "https://fixtures.adaparse.local/new-catalog": neu,
      "https://fixtures.adaparse.local/": moved,
    });

    const result = await runJob({
      config,
      fetcher,
      db: openMemoryDb(),
      doctor: false,
      log: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.meta.healed).toBe(true);
    expect(result.meta.source).toBe("discovery");
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.meta.discoveredUrl).toContain("new-catalog");
  });
});
