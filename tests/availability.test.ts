import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { extractFromHtml } from "../src/sources/index.js";
import { scoreAndFilter } from "../src/match/scorer.js";

describe("availability", () => {
  it("extracts in_stock from JSON-LD Offer", () => {
    const html = readFileSync(resolve("fixtures/html/availability_page.html"), "utf8");
    const attempt = extractFromHtml(
      html,
      "https://fixtures.adaparse.local/product/alpine-backpack",
      "availability",
      PRESETS.availability.defaultFields,
    );
    expect(attempt.source).toBe("jsonld");
    const { items } = scoreAndFilter(attempt, PRESETS.availability.defaultFields);
    expect(items.length).toBe(1);
    expect(items[0]?.fields.availability?.value).toBe("in_stock");
    expect(items[0]?.fields.title?.value).toBe("Alpine Backpack");
  });
});
