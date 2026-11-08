import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";
import { PRESETS } from "../src/config/presets.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { runHeal } from "../src/heal/orchestrate.js";
import { openMemoryDb } from "../src/memory/db.js";
import { buildGenomeFromItems, saveRuleVersion } from "../src/memory/rules.js";
import { extractFromHtml } from "../src/sources/index.js";
import { scoreAndFilter } from "../src/match/scorer.js";
import { baselineFromCandidates } from "../src/heal/canary.js";

describe("self-heal", () => {
  it("heals renamed layout via signal redetect against baseline", async () => {
    const htmlA = readFileSync(resolve("fixtures/html/A_old_layout.html"), "utf8");
    const htmlB = readFileSync(resolve("fixtures/html/B_renamed_classes.html"), "utf8");
    const fields = PRESETS.product_list.defaultFields;

    const good = extractFromHtml(htmlA, "https://fixtures.adaparse.local/catalog", "product_list", fields);
    const { items: goodItems } = scoreAndFilter(good, fields);
    const genome = buildGenomeFromItems(goodItems, "https://fixtures.adaparse.local/catalog", [
      "jsonld",
      "html_signals",
    ]);
    const baseline = baselineFromCandidates(goodItems);

    const db = openMemoryDb();
    saveRuleVersion(db, "t", "product_list", genome);

    const config = normalizeConfig({
      site: "t",
      entry: "https://fixtures.adaparse.local/catalog",
      target: { preset: "product_list" },
      heal: { enabled: true, discovery: false, canary: "balanced" },
      budgets: {
        max_pages: 5,
        max_depth: 1,
        concurrency: 1,
        request_timeout_ms: 3000,
        time_budget_ms: 5000,
      },
    });

    // Simulate broken page that yields nothing meaningful, then heal on B content
    const emptyHtml = "<html><body><h1>Loading</h1><div id='app'></div></body></html>";
    const fetcher = new FixtureFetcher({
      "https://fixtures.adaparse.local/catalog": htmlB,
    });

    const outcome = await runHeal({
      config,
      fetcher,
      html: htmlB, // same-page heal with B (signals work; canary vs baseline)
      url: "https://fixtures.adaparse.local/catalog",
      genome,
      baseline,
      persist: true,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.healed).toBe(true);
    expect(outcome.plain.length).toBe(3);

    // Garbage heal must not pass canary
    const bad = await runHeal({
      config,
      fetcher,
      html: emptyHtml,
      url: "https://fixtures.adaparse.local/catalog",
      genome,
      baseline,
      persist: true,
    });
    expect(bad.ok).toBe(false);
  });
});
