import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { extractFromHtml } from "../src/sources/index.js";
import { scoreAndFilter } from "../src/match/scorer.js";

describe("article_list", () => {
  it("extracts articles from JSON-LD ItemList", () => {
    const html = readFileSync(resolve("fixtures/html/articles_list.html"), "utf8");
    const attempt = extractFromHtml(
      html,
      "https://fixtures.adaparse.local/blog",
      "article_list",
      PRESETS.article_list.defaultFields,
    );
    expect(attempt.source).toBe("jsonld");
    const { items } = scoreAndFilter(attempt, PRESETS.article_list.defaultFields);
    expect(items.length).toBe(3);
    expect(items[0]?.fields.title?.value).toBeTruthy();
    expect(items[0]?.fields.url?.value).toMatch(/blog\//);
    expect(items[0]?.fields.date?.value).toBeTruthy();
  });
});
