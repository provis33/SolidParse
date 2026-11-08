import type { ExtractAttempt, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";
import { parseMoneyAmount, detectCurrency } from "../signals/money.js";

export const openGraphExtractor: SourceExtractor = {
  name: "opengraph",
  extract(ctx: SourceContext): ExtractAttempt | null {
    const $ = ctx.$;
    const meta = (prop: string) =>
      $(`meta[property="${prop}"], meta[name="${prop}"]`).attr("content")?.trim();

    const fields: Record<string, ScoredValue> = {};
    const title = meta("og:title") || meta("twitter:title");
    if (title) fields.title = { value: title, score: 0.8, reasons: ["og:title"] };

    const desc = meta("og:description") || meta("twitter:description");
    if (desc) {
      if (ctx.preset === "article_list") {
        fields.excerpt = { value: desc.slice(0, 500), score: 0.7, reasons: ["og:description"] };
      } else {
        fields.description = {
          value: desc.slice(0, 2000),
          score: 0.7,
          reasons: ["og:description"],
        };
      }
    }

    const image = meta("og:image") || meta("twitter:image");
    if (image) {
      try {
        fields.image = {
          value: new URL(image, ctx.url).toString(),
          score: 0.75,
          reasons: ["og:image"],
        };
      } catch {
        fields.image = { value: image, score: 0.65, reasons: ["og:image"] };
      }
    }

    const url = meta("og:url");
    if (url) {
      fields.url = { value: url, score: 0.75, reasons: ["og:url"] };
    } else if (ctx.preset === "product_detail" || ctx.preset === "availability") {
      fields.url = { value: ctx.url, score: 0.55, reasons: ["page:self"] };
    }

    const amountMeta = meta("product:price:amount") || meta("og:price:amount");
    if (amountMeta) {
      const amount = parseMoneyAmount(amountMeta);
      if (amount != null) {
        fields.price = { value: amount, score: 0.85, reasons: ["og:price"] };
      }
    }
    const cur = meta("product:price:currency") || meta("og:price:currency") || detectCurrency(desc || title || "");
    if (cur) fields.currency = { value: cur, score: 0.75, reasons: ["og:currency"] };

    // OG alone rarely enough for lists
    if (ctx.preset === "product_list" || ctx.preset === "article_list" || ctx.preset === "custom") {
      return null;
    }

    if (!Object.keys(fields).length) return null;
    if (ctx.preset === "price_only" && !fields.price) return null;
    if (ctx.preset === "availability") return null;

    const item: ItemCandidate = {
      fields,
      score:
        Object.values(fields).reduce((s, f) => s + f.score, 0) / Math.max(1, Object.keys(fields).length),
      reasons: ["source:opengraph"],
    };

    return {
      source: "opengraph",
      items: [item],
      diagnostics: [
        {
          level: "info",
          code: "opengraph_hit",
          message: `OpenGraph fields: ${Object.keys(fields).join(", ")}`,
        },
      ],
      scores: { opengraph: item.score },
    };
  },
};
