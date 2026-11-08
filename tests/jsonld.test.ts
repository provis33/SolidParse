import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { extractFromHtml } from "../src/sources/index.js";

const html = readFileSync(resolve("fixtures/html/A_old_layout.html"), "utf8");

describe("jsonld", () => {
  it("extracts product_list from ItemList JSON-LD", () => {
    const attempt = extractFromHtml(
      html,
      "https://fixtures.adaparse.local/catalog",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    expect(attempt.source).toBe("jsonld");
    expect(attempt.items.length).toBeGreaterThanOrEqual(3);
    expect(attempt.items[0]?.fields.title?.value).toBeTruthy();
    expect(attempt.items[0]?.fields.price?.value).toBeTypeOf("number");
  });

  it("extracts product_detail", () => {
    const detail = readFileSync(resolve("fixtures/html/product_detail.html"), "utf8");
    const attempt = extractFromHtml(
      detail,
      "https://fixtures.adaparse.local/product/alpine-backpack",
      "product_detail",
      PRESETS.product_detail.defaultFields,
    );
    expect(attempt.items.length).toBe(1);
    expect(attempt.items[0]?.fields.title?.value).toBe("Alpine Backpack");
    expect(attempt.items[0]?.fields.price?.value).toBe(129);
  });
});
