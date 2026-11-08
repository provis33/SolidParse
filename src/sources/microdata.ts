import type { ExtractAttempt, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";
import { parseMoneyAmount, detectCurrency } from "../signals/money.js";

export const microdataExtractor: SourceExtractor = {
  name: "microdata",
  extract(ctx: SourceContext): ExtractAttempt | null {
    const $ = ctx.$;
    const nodes = $("[itemscope][itemtype]").toArray();
    if (!nodes.length) return null;

    const items: ItemCandidate[] = [];

    for (const el of nodes) {
      const type = ($(el).attr("itemtype") || "").toLowerCase();
      const isProduct = /product/i.test(type);
      const isArticle = /article|blogposting|newsarticle/i.test(type);
      if (ctx.preset.startsWith("product") || ctx.preset === "price_only" || ctx.preset === "availability") {
        if (!isProduct) continue;
      } else if (ctx.preset === "article_list") {
        if (!isArticle) continue;
      } else if (!isProduct && !isArticle) {
        continue;
      }

      const fields: Record<string, ScoredValue> = {};
      const title = $(el).find("[itemprop=name],[itemprop=headline]").first().text().trim();
      if (title) fields.title = { value: title, score: 0.9, reasons: ["microdata:name"] };

      const priceRaw =
        $(el).find("[itemprop=price]").attr("content") ||
        $(el).find("[itemprop=price]").first().text();
      if (priceRaw) {
        const amount = parseMoneyAmount(priceRaw);
        if (amount != null) {
          fields.price = { value: amount, score: 0.9, reasons: ["microdata:price"] };
        }
      }
      const currency =
        $(el).find("[itemprop=priceCurrency]").attr("content") ||
        $(el).find("[itemprop=priceCurrency]").text() ||
        detectCurrency($(el).text());
      if (currency) {
        fields.currency = { value: currency, score: 0.85, reasons: ["microdata:currency"] };
      }

      const avail =
        $(el).find("[itemprop=availability]").attr("href") ||
        $(el).find("[itemprop=availability]").text();
      if (avail) {
        fields.availability = {
          value: /outofstock/i.test(avail)
            ? "out_of_stock"
            : /preorder/i.test(avail)
              ? "preorder"
              : "in_stock",
          score: 0.85,
          reasons: ["microdata:availability"],
        };
      }

      const url =
        $(el).find("[itemprop=url]").attr("href") ||
        $(el).find("a[href]").first().attr("href");
      if (url) {
        try {
          fields.url = {
            value: new URL(url, ctx.url).toString(),
            score: 0.85,
            reasons: ["microdata:url"],
          };
        } catch {
          fields.url = { value: url, score: 0.7, reasons: ["microdata:url"] };
        }
      }

      const img =
        $(el).find("[itemprop=image]").attr("src") ||
        $(el).find("[itemprop=image]").attr("content") ||
        $(el).find("img").attr("src");
      if (img) {
        try {
          fields.image = {
            value: new URL(img, ctx.url).toString(),
            score: 0.8,
            reasons: ["microdata:image"],
          };
        } catch {
          fields.image = { value: img, score: 0.7, reasons: ["microdata:image"] };
        }
      }

      const desc = $(el).find("[itemprop=description]").text().trim();
      if (desc && ctx.preset === "article_list") {
        fields.excerpt = {
          value: desc.slice(0, 500),
          score: 0.75,
          reasons: ["microdata:description"],
        };
      } else if (desc) {
        fields.description = {
          value: desc.slice(0, 2000),
          score: 0.75,
          reasons: ["microdata:description"],
        };
      }

      const date =
        $(el).find("[itemprop=datePublished]").attr("content") ||
        $(el).find("[itemprop=datePublished]").attr("datetime") ||
        $(el).find("time").attr("datetime");
      if (date) {
        fields.date = {
          value: String(date).slice(0, 10),
          score: 0.85,
          reasons: ["microdata:datePublished"],
        };
      }

      if (ctx.preset === "availability" && fields.availability) {
        items.push({
          fields: {
            availability: fields.availability,
            ...(fields.title ? { title: fields.title } : {}),
          },
          score: 0.88,
          reasons: ["source:microdata"],
        });
        continue;
      }

      if (Object.keys(fields).length) {
        const score =
          Object.values(fields).reduce((s, f) => s + f.score, 0) / Object.keys(fields).length;
        items.push({ fields, score, reasons: ["source:microdata"] });
      }
    }

    if (!items.length) return null;
    return {
      source: "microdata",
      items:
        ctx.preset === "product_detail" ||
        ctx.preset === "price_only" ||
        ctx.preset === "availability"
          ? items.slice(0, 1)
          : items,
      diagnostics: [
        {
          level: "info",
          code: "microdata_hit",
          message: `Extracted ${items.length} item(s) from microdata`,
        },
      ],
      scores: { microdata: items.reduce((s, i) => s + i.score, 0) / items.length },
    };
  },
};
