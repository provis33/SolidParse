import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "../src/config/load.js";
import { openMemoryDb } from "../src/memory/db.js";
import { runJob } from "../src/runner/orchestrator.js";

describe("mock-site e2e", () => {
  it("runs demo-mock-site config with pagination", async () => {
    const config = loadConfigFromFile("fixtures/configs/demo-mock-site.yaml");
    const result = await runJob({
      config,
      db: openMemoryDb(),
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(result.meta.pagesFetched).toBeGreaterThanOrEqual(2);
  });
});
