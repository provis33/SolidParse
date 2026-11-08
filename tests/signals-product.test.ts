import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { scoreAndFilter } from "../src/match/scorer.js";
import { htmlSignalsExtractor } from "../src/sources/html-signals.js";
import { buildSourceContext } from "../src/sources/index.js";

describe("html signals product_list", () => {
  it("extracts from renamed classes (fixture B)", () => {
    const html = readFileSync(resolve("fixtures/html/B_renamed_classes.html"), "utf8");
    const ctx = buildSourceContext(
      html,
      "https://fixtures.adaparse.local/catalog",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    const attempt = htmlSignalsExtractor.extract(ctx)!;
    const { items } = scoreAndFilter(attempt, PRESETS.product_list.defaultFields);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.fields.title?.value)).toContain("Alpine Backpack");
    expect(items.every((i) => typeof i.fields.price?.value === "number")).toBe(true);
  });

  it("extracts from restructured markup (fixture C)", () => {
    const html = readFileSync(resolve("fixtures/html/C_structure_changed.html"), "utf8");
    const ctx = buildSourceContext(
      html,
      "https://fixtures.adaparse.local/catalog",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    const attempt = htmlSignalsExtractor.extract(ctx)!;
    const { items } = scoreAndFilter(attempt, PRESETS.product_list.defaultFields);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
