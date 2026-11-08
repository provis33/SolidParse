import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config/load.js";

describe("config", () => {
  it("normalizes YAML-like object and fills preset fields", () => {
    const cfg = normalizeConfig({
      site: "s",
      entry: "https://example.com/c",
      target: { preset: "product_list" },
    });
    expect(cfg.target.fields.some((f) => f.name === "price")).toBe(true);
    expect(cfg.budgets.maxPages).toBe(30);
    expect(cfg.heal.canary).toBe("balanced");
  });

  it("rejects invalid config", () => {
    expect(() =>
      normalizeConfig({
        site: "",
        entry: "not-a-url",
        target: { preset: "product_list" },
      }),
    ).toThrow(/invalid_target_config/);
  });

  it("rejects custom preset without fields", () => {
    expect(() =>
      normalizeConfig({
        site: "s",
        entry: "https://example.com/c",
        target: { preset: "custom" },
      }),
    ).toThrow(/custom preset requires/);
  });

  it("normalizes notify block", () => {
    const cfg = normalizeConfig({
      site: "s",
      entry: "https://example.com/c",
      target: { preset: "price_only" },
      notify: { enabled: true, webhook_url: "https://hooks.example.com/x" },
    });
    expect(cfg.notify?.enabled).toBe(true);
    expect(cfg.notify?.webhookUrl).toBe("https://hooks.example.com/x");
  });
});
