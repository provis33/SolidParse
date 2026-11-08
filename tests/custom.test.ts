import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { openMemoryDb } from "../src/memory/db.js";
import { runJob } from "../src/runner/orchestrator.js";
import type { FieldConfig } from "../src/types.js";

const fields: FieldConfig[] = [
  { name: "title", required: true, normalize: "string" },
  { name: "url", required: true, normalize: "url" },
  { name: "role", required: true, normalize: "enum", enumValues: ["engineer", "manager"] },
  { name: "active", required: false, normalize: "boolean" },
];

describe("custom preset", () => {
  it("rejects custom without fields", () => {
    expect(() =>
      normalizeConfig({
        site: "x",
        entry: "https://example.com/",
        target: { preset: "custom" },
      }),
    ).toThrow(/custom preset requires/);
  });

  it("extracts typed custom list fields", async () => {
    const html = readFileSync(resolve("fixtures/html/custom_page.html"), "utf8");
    const config = normalizeConfig({
      site: "custom-test",
      entry: "https://fixtures.adaparse.local/team",
      target: { preset: "custom", fields },
      heal: { enabled: false, discovery: false, canary: "permissive" },
      budgets: {
        max_pages: 3,
        max_depth: 1,
        concurrency: 1,
        request_timeout_ms: 3000,
        time_budget_ms: 5000,
      },
      notify: { enabled: true },
    });

    const result = await runJob({
      config,
      fetcher: new FixtureFetcher({
        "https://fixtures.adaparse.local/team": html,
      }),
      db: openMemoryDb(),
      log: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items[0]).toHaveProperty("title");
    expect(result.items[0]).toHaveProperty("url");
    expect(result.meta.diagnostics.some((d) => d.code === "notify_stub")).toBe(true);
  });
});
