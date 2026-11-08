import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { validateCanary, type CanaryBaseline } from "../src/heal/canary.js";
import type { ItemCandidate } from "../src/types.js";

function item(title: string, price: number): ItemCandidate {
  return {
    score: 0.8,
    reasons: [],
    fields: {
      title: { value: title, score: 0.8, reasons: [] },
      price: { value: price, score: 0.8, reasons: [] },
      url: { value: "https://x.test/p", score: 0.8, reasons: [] },
    },
  };
}

describe("canary", () => {
  const fields = PRESETS.product_list.defaultFields;
  const baseline: CanaryBaseline = {
    itemCount: 3,
    prices: [129, 89.5, 34.99],
    titleLengths: [15, 18, 12],
  };

  it("accepts similar extract in balanced mode", () => {
    const items = [
      item("Alpine Pack Pro", 120),
      item("Trail Runner Max", 90),
      item("Camp Lantern XL", 40),
    ];
    const r = validateCanary(items, fields, "balanced", baseline);
    expect(r.ok).toBe(true);
  });

  it("rejects drastic count drift in balanced mode", () => {
    const items = [item("Only One Product Left", 120)];
    const r = validateCanary(items, fields, "balanced", baseline);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "count_drift")).toBe(true);
  });

  it("rejects missing required fields", () => {
    const items: ItemCandidate[] = [
      {
        score: 0.5,
        reasons: [],
        fields: {
          title: { value: "X", score: 0.5, reasons: [] },
        },
      },
    ];
    const r = validateCanary(items, fields, "permissive", null);
    expect(r.ok).toBe(false);
  });
});
