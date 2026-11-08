import type { ExtractAttempt, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";

export const jsonLdExtractor: SourceExtractor = {
  name: "jsonld",
  extract(ctx: SourceContext): ExtractAttempt | null {
    const blocks: unknown[] = [];
    ctx.$('script[type="application/ld+json"]').each((_, el) => {
      const raw = ctx.$(el).text();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) blocks.push(...parsed);
        else blocks.push(parsed);
      } catch {
        // ignore malformed
      }
    });

    if (!blocks.length) return null;

    const products = flattenByType(blocks, /Product/i);
    const articles = flattenByType(blocks, /Article|BlogPosting|NewsArticle/i);
    const items: ItemCandidate[] = [];

    if (ctx.preset === "product_list" || ctx.preset === "product_detail") {
      for (const p of products) {
        const fields = productFields(p);
        if (Object.keys(fields).length) {
          items.push(itemFromFields(fields));
        }
      }
    }

    if (ctx.preset === "price_only") {
      for (const p of products) {
        const offer = firstOffer(p);
        if (offer?.price == null) continue;
        const amount = Number(offer.price);
        if (!Number.isFinite(amount)) continue;
        const fields: Record<string, ScoredValue> = {
          price: { value: amount, score: 0.95, reasons: ["jsonld:price"] },
        };
        if (offer.priceCurrency) {
          fields.currency = {
            value: String(offer.priceCurrency),
            score: 0.9,
            reasons: ["jsonld:currency"],
          };
        }
        if (p.name) {
          fields.label = { value: String(p.name), score: 0.7, reasons: ["jsonld:name"] };
        }
        items.push(itemFromFields(fields));
      }
    }

    if (ctx.preset === "availability") {
      for (const p of products) {
        const offer = firstOffer(p);
        if (!offer?.availability) continue;
        const fields: Record<string, ScoredValue> = {
          availability: {
            value: normalizeAvailability(String(offer.availability)),
            score: 0.95,
            reasons: ["jsonld:offers.availability"],
          },
        };
        if (p.name) {
          fields.title = { value: String(p.name), score: 0.85, reasons: ["jsonld:name"] };
        }
        items.push(itemFromFields(fields));
      }
    }

    if (ctx.preset === "article_list") {
      for (const a of articles) {
        const fields: Record<string, ScoredValue> = {};
        const title = a.headline || a.name;
        if (title) {
          fields.title = { value: String(title), score: 0.95, reasons: ["jsonld:headline"] };
        }
        if (a.url || a["@id"]) {
          fields.url = {
            value: String(a.url || a["@id"]),
            score: 0.9,
            reasons: ["jsonld:url"],
          };
        }
        const date = a.datePublished || a.dateCreated || a.dateModified;
        if (date) {
          fields.date = {
            value: String(date).slice(0, 10),
            score: 0.9,
            reasons: ["jsonld:datePublished"],
          };
        }
        if (a.description) {
          fields.excerpt = {
            value: String(a.description).slice(0, 500),
            score: 0.8,
            reasons: ["jsonld:description"],
          };
        }
        if (fields.title && fields.url) items.push(itemFromFields(fields));
      }
    }

    if (!items.length) return null;

    const single =
      ctx.preset === "product_detail" ||
      ctx.preset === "price_only" ||
      ctx.preset === "availability";

    return {
      source: "jsonld",
      items: single ? items.slice(0, 1) : items,
      diagnostics: [
        {
          level: "info",
          code: "jsonld_hit",
          message: `Extracted ${items.length} item(s) from JSON-LD`,
        },
      ],
      scores: { jsonld: items.reduce((s, i) => s + i.score, 0) / items.length },
    };
  },
};

function productFields(p: Record<string, unknown>): Record<string, ScoredValue> {
  const fields: Record<string, ScoredValue> = {};
  if (p.name) {
    fields.title = { value: String(p.name), score: 0.95, reasons: ["jsonld:name"] };
  }
  const offer = firstOffer(p);
  if (offer?.price != null) {
    const amount = Number(offer.price);
    if (Number.isFinite(amount)) {
      fields.price = {
        value: amount,
        score: 0.95,
        reasons: ["jsonld:offers.price"],
      };
    }
    if (offer.priceCurrency) {
      fields.currency = {
        value: String(offer.priceCurrency),
        score: 0.9,
        reasons: ["jsonld:offers.priceCurrency"],
      };
    }
    if (offer.availability) {
      fields.availability = {
        value: normalizeAvailability(String(offer.availability)),
        score: 0.85,
        reasons: ["jsonld:offers.availability"],
      };
    }
  }
  if (p.url || p["@id"]) {
    fields.url = {
      value: String(p.url || p["@id"]),
      score: 0.9,
      reasons: ["jsonld:url"],
    };
  }
  const img = firstImage(p.image);
  if (img) {
    fields.image = { value: img, score: 0.85, reasons: ["jsonld:image"] };
  }
  if (p.sku) {
    fields.sku = { value: String(p.sku), score: 0.9, reasons: ["jsonld:sku"] };
  }
  if (p.description) {
    fields.description = {
      value: String(p.description),
      score: 0.8,
      reasons: ["jsonld:description"],
    };
  }
  return fields;
}

function itemFromFields(fields: Record<string, ScoredValue>): ItemCandidate {
  const score =
    Object.values(fields).reduce((s, f) => s + f.score, 0) / Math.max(1, Object.keys(fields).length);
  return { fields, score, reasons: ["source:jsonld"] };
}

function flattenByType(
  blocks: unknown[],
  typeRe: RegExp,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
    if (types.some((t) => typeRe.test(t))) out.push(obj);
    if (types.some((t) => /ItemList/i.test(t)) && Array.isArray(obj.itemListElement)) {
      for (const el of obj.itemListElement) {
        if (el && typeof el === "object") {
          const e = el as Record<string, unknown>;
          visit(e.item ?? e);
        }
      }
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  blocks.forEach(visit);
  return out;
}

function firstOffer(p: Record<string, unknown>): Record<string, unknown> | null {
  const offers = p.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) return (offers[0] as Record<string, unknown>) ?? null;
  if (typeof offers === "object") return offers as Record<string, unknown>;
  return null;
}

function firstImage(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return firstImage(image[0]);
  if (typeof image === "object" && image && "url" in image) {
    return String((image as { url: unknown }).url);
  }
  return null;
}

function normalizeAvailability(raw: string): string {
  if (/OutOfStock|SoldOut/i.test(raw)) return "out_of_stock";
  if (/InStock|LimitedAvailability/i.test(raw)) return "in_stock";
  if (/PreOrder/i.test(raw)) return "preorder";
  return raw.replace(/^.*\//, "").toLowerCase();
}
