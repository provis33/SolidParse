import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { openMemoryDb } from "../src/memory/db.js";
import { getLatestRule } from "../src/memory/rules.js";
import { runJob } from "../src/runner/orchestrator.js";

describe("e2e pipeline", () => {
  it("extract A → break classes B still works via signals → C heals/extracts", async () => {
    const A = readFileSync(resolve("fixtures/html/A_old_layout.html"), "utf8");
    const B = readFileSync(resolve("fixtures/html/B_renamed_classes.html"), "utf8");
    const C = readFileSync(resolve("fixtures/html/C_structure_changed.html"), "utf8");

    const db = openMemoryDb();
    const base = {
      site: "e2e",
      entry: "https://fixtures.adaparse.local/catalog",
      target: { preset: "product_list" as const },
      heal: { enabled: true, discovery: false, canary: "balanced" as const },
      budgets: {
        max_pages: 5,
        max_depth: 1,
        concurrency: 1,
        request_timeout_ms: 3000,
        time_budget_ms: 5000,
      },
    };

    const r1 = await runJob({
      config: normalizeConfig(base),
      fetcher: new FixtureFetcher({ "https://fixtures.adaparse.local/catalog": A }),
      db,
      log: () => {},
    });
    expect(r1.ok).toBe(true);
    expect(r1.items.length).toBe(3);
    expect(r1.meta.source).toBe("jsonld");
    expect(getLatestRule(db, "e2e", "product_list")?.version).toBe(1);

    const r2 = await runJob({
      config: normalizeConfig(base),
      fetcher: new FixtureFetcher({ "https://fixtures.adaparse.local/catalog": B }),
      db,
      log: () => {},
    });
    expect(r2.ok).toBe(true);
    expect(r2.items.length).toBe(3);

    const r3 = await runJob({
      config: normalizeConfig(base),
      fetcher: new FixtureFetcher({ "https://fixtures.adaparse.local/catalog": C }),
      db,
      log: () => {},
    });
    expect(r3.ok).toBe(true);
    expect(r3.items.length).toBeGreaterThanOrEqual(2);
  });
});
