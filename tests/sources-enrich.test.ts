import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/config/presets.js";
import { FixtureFetcher } from "../src/fetch/fixture.js";
import { mineAndFetchApi, mineEndpoints } from "../src/sources/api-mine.js";
import { extractFromHtml, buildSourceContext } from "../src/sources/index.js";
import { microdataExtractor } from "../src/sources/microdata.js";
import { openGraphExtractor } from "../src/sources/opengraph.js";

describe("enriched sources", () => {
  it("extracts microdata products", () => {
    const html = readFileSync(resolve("fixtures/mock-site/catalog-page1.html"), "utf8");
    const ctx = buildSourceContext(
      html,
      "https://mock.adaparse.local/catalog?page=1",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    const attempt = microdataExtractor.extract(ctx);
    expect(attempt?.items.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts opengraph product detail", () => {
    const html = readFileSync(resolve("fixtures/mock-site/product-og.html"), "utf8");
    const ctx = buildSourceContext(
      html,
      "https://mock.adaparse.local/p/omega",
      "product_detail",
      PRESETS.product_detail.defaultFields,
    );
    const attempt = openGraphExtractor.extract(ctx);
    expect(attempt?.items[0]?.fields.title?.value).toBe("Omega Speaker");
    expect(attempt?.items[0]?.fields.price?.value).toBe(59.9);
  });

  it("mines and fetches API JSON", async () => {
    const html = readFileSync(resolve("fixtures/mock-site/catalog-page1.html"), "utf8");
    const endpoints = mineEndpoints(html, "https://mock.adaparse.local/catalog?page=1");
    expect(endpoints.some((e) => e.includes("/api/products.json"))).toBe(true);

    const ctx = buildSourceContext(
      html,
      "https://mock.adaparse.local/catalog?page=1",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    const fetcher = new FixtureFetcher({
      "https://mock.adaparse.local/api/products.json": "fixtures/mock-site/api-products.json",
    });
    const attempt = await mineAndFetchApi(ctx, fetcher);
    expect(attempt?.items.length).toBeGreaterThanOrEqual(2);
    expect(attempt?.source).toBe("api_mine");
  });

  it("prefers structured sources in extractFromHtml", () => {
    const html = readFileSync(resolve("fixtures/mock-site/catalog-page1.html"), "utf8");
    const attempt = extractFromHtml(
      html,
      "https://mock.adaparse.local/catalog?page=1",
      "product_list",
      PRESETS.product_list.defaultFields,
    );
    expect(["jsonld", "microdata"]).toContain(attempt.source);
  });
});
