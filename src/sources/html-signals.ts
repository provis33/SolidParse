import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { availabilityCandidates } from "../signals/availability.js";
import { booleanCandidates } from "../signals/boolean.js";
import { findCardClusters, fingerprintElement } from "../signals/cards.js";
import { dateCandidates } from "../signals/date.js";
import { imageCandidates } from "../signals/image.js";
import { detailLinkCandidates } from "../signals/links.js";
import { detectCurrency, moneyCandidatesFromText } from "../signals/money.js";
import { titleCandidates } from "../signals/title.js";
import type {
  ExtractAttempt,
  FieldConfig,
  FieldType,
  ItemCandidate,
  ScoredValue,
} from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";

export const htmlSignalsExtractor: SourceExtractor = {
  name: "html_signals",
  extract(ctx: SourceContext): ExtractAttempt {
    if (ctx.preset === "product_list") return extractProductList(ctx);
    if (ctx.preset === "article_list") return extractArticleList(ctx);
    if (ctx.preset === "availability") return extractAvailability(ctx);
    if (ctx.preset === "custom") return extractCustom(ctx);
    if (ctx.preset === "price_only") return extractPriceOnly(ctx);
    return extractDetail(ctx);
  },
};

function extractProductList(ctx: SourceContext): ExtractAttempt {
  return extractClusteredList(ctx, "product", (el) => extractProductCard(ctx, el));
}

function extractArticleList(ctx: SourceContext): ExtractAttempt {
  return extractClusteredList(ctx, "article", (el) => extractArticleCard(ctx, el));
}

function extractClusteredList(
  ctx: SourceContext,
  mode: "product" | "article",
  build: (el: Element) => ItemCandidate | null,
): ExtractAttempt {
  const clusters = findCardClusters(ctx.$, mode);
  const best = clusters[0];
  const diagnostics = [
    {
      level: "info" as const,
      code: "card_clusters",
      message: `Found ${clusters.length} card cluster(s)`,
      details: { topScore: best?.score ?? 0, mode },
    },
  ];

  if (!best || best.score < 0.35) {
    return {
      source: "html_signals",
      items: [],
      diagnostics: [
        ...diagnostics,
        { level: "warn", code: "no_cards", message: "No strong card cluster found" },
      ],
      scores: { cards: best?.score ?? 0 },
    };
  }

  const items: ItemCandidate[] = [];
  for (const el of best.elements) {
    const item = build(el);
    if (item) items.push(item);
  }

  return {
    source: "html_signals",
    items,
    diagnostics: [
      ...diagnostics,
      {
        level: "info",
        code: "html_list_extract",
        message: `Built ${items.length} item candidate(s) from cards`,
      },
    ],
    scores: {
      cards: best.score,
      avgItem: items.length ? items.reduce((s, i) => s + i.score, 0) / items.length : 0,
    },
  };
}

function extractProductCard(ctx: SourceContext, el: Element): ItemCandidate | null {
  const $ = ctx.$;
  const scopeRoot = $(el);
  const text = scopeRoot.text();
  const fields: Record<string, ScoredValue> = {};

  const titleFromHeading = scopeRoot.find("h1,h2,h3,h4,.title,[itemprop=name]").first().text();
  const titleFromLink = scopeRoot.find("a[href]").first().text();
  const titleText = (titleFromHeading || titleFromLink).replace(/\s+/g, " ").trim();
  if (titleText) {
    fields.title = {
      value: titleText,
      score: titleFromHeading ? 0.85 : 0.65,
      reasons: [titleFromHeading ? "card:heading" : "card:link_text"],
    };
  }

  const money = moneyCandidatesFromText(text);
  if (money[0]) {
    fields.price = money[0];
    const cur = detectCurrency(text);
    if (cur) fields.currency = { value: cur, score: 0.7, reasons: ["card:currency"] };
  }

  const link = absoluteHref(scopeRoot.find("a[href]").first().attr("href"), ctx.url);
  if (link) fields.url = { value: link, score: 0.75, reasons: ["card:href"] };

  const img = scopeRoot.find("img[src],img[data-src]").first();
  if (img.length) {
    const src = img.attr("src") || img.attr("data-src") || "";
    if (src && !src.startsWith("data:")) {
      fields.image = {
        value: absoluteHref(src, ctx.url) ?? src,
        score: 0.7,
        reasons: ["card:img"],
      };
    }
  }

  const avail = availabilityCandidates(text)[0];
  if (avail) fields.availability = avail;

  if (!fields.title && !fields.price) return null;
  return scoredItem(fields, ["source:html_signals", "unit:product_card"], fingerprintElement($, el));
}

function extractArticleCard(ctx: SourceContext, el: Element): ItemCandidate | null {
  const $ = ctx.$;
  const scopeRoot = $(el);
  const fields: Record<string, ScoredValue> = {};

  const titleFromHeading = scopeRoot
    .find("h1,h2,h3,h4,.title,[itemprop=headline],[itemprop=name]")
    .first()
    .text();
  const titleFromLink = scopeRoot.find("a[href]").first().text();
  const titleText = (titleFromHeading || titleFromLink).replace(/\s+/g, " ").trim();
  if (titleText) {
    fields.title = {
      value: titleText,
      score: titleFromHeading ? 0.85 : 0.7,
      reasons: [titleFromHeading ? "card:heading" : "card:link_text"],
    };
  }

  const link = absoluteHref(scopeRoot.find("a[href]").first().attr("href"), ctx.url);
  if (link) fields.url = { value: link, score: 0.8, reasons: ["card:href"] };

  const dates = dateCandidates($, el);
  if (dates[0]) fields.date = dates[0];

  const excerpt =
    scopeRoot.find("[itemprop=description], .excerpt, .summary, p").first().text().trim() ||
    "";
  if (excerpt && excerpt !== titleText) {
    fields.excerpt = {
      value: excerpt.slice(0, 500).replace(/\s+/g, " "),
      score: 0.65,
      reasons: ["card:excerpt"],
    };
  }

  if (!fields.title || !fields.url) return null;
  return scoredItem(fields, ["source:html_signals", "unit:article_card"], fingerprintElement($, el));
}

function extractAvailability(ctx: SourceContext): ExtractAttempt {
  const $ = ctx.$;
  const text = $("main, [itemtype*=Product], body").first().text();
  const fields: Record<string, ScoredValue> = {};

  const avail = availabilityCandidates(text)[0];
  if (avail) fields.availability = avail;

  const titles = titleCandidates($);
  if (titles[0]) fields.title = titles[0];

  // schema.org itemprop fallback
  const prop = $("[itemprop=availability]").attr("href") || $("[itemprop=availability]").text();
  if (prop && !fields.availability) {
    const mapped = availabilityCandidates(prop)[0];
    if (mapped) {
      fields.availability = { ...mapped, reasons: [...mapped.reasons, "itemprop:availability"] };
    } else if (/instock|outofstock|preorder/i.test(prop)) {
      fields.availability = {
        value: /outofstock/i.test(prop)
          ? "out_of_stock"
          : /preorder/i.test(prop)
            ? "preorder"
            : "in_stock",
        score: 0.8,
        reasons: ["itemprop:availability"],
      };
    }
  }

  if (!fields.availability) {
    return {
      source: "html_signals",
      items: [],
      diagnostics: [
        { level: "warn", code: "no_availability", message: "No availability signals found" },
      ],
      scores: { availability: 0 },
    };
  }

  const item = scoredItem(fields, ["source:html_signals", "unit:availability"]);
  return {
    source: "html_signals",
    items: [item],
    diagnostics: [
      {
        level: "info",
        code: "availability_extract",
        message: `availability=${String(fields.availability.value)}`,
      },
    ],
    scores: { availability: fields.availability.score },
  };
}

function extractCustom(ctx: SourceContext): ExtractAttempt {
  const fields = ctx.fields;
  if (!fields.length) {
    return {
      source: "html_signals",
      items: [],
      diagnostics: [
        {
          level: "error",
          code: "custom_no_fields",
          message: "custom preset requires explicit fields",
        },
      ],
      scores: {},
    };
  }

  const listLike =
    fields.some((f) => f.name === "url" || f.normalize === "url") &&
    fields.some((f) => f.name === "title" || f.normalize === "string");

  if (listLike) {
    const mode = fields.some((f) => f.name === "price" || f.normalize === "money")
      ? "product"
      : "article";
    return extractClusteredList(ctx, mode, (el) => extractCustomCard(ctx, el, fields));
  }

  const pageFields = fillFieldsFromPage(ctx, fields);
  if (!Object.keys(pageFields).length) {
    return {
      source: "html_signals",
      items: [],
      diagnostics: [
        { level: "warn", code: "custom_empty", message: "No custom fields matched signals" },
      ],
      scores: {},
    };
  }

  const item = scoredItem(pageFields, ["source:html_signals", "unit:custom_page"]);
  return {
    source: "html_signals",
    items: [item],
    diagnostics: [
      {
        level: "info",
        code: "custom_page_extract",
        message: `Custom fields: ${Object.keys(pageFields).join(", ")}`,
      },
    ],
    scores: { custom: item.score },
  };
}

function extractCustomCard(
  ctx: SourceContext,
  el: Element,
  fieldDefs: FieldConfig[],
): ItemCandidate | null {
  const filled = fillFieldsFromScope(ctx, el, fieldDefs);
  const required = fieldDefs.filter((f) => f.required).map((f) => f.name);
  if (required.some((n) => !filled[n])) return null;
  if (!Object.keys(filled).length) return null;
  return scoredItem(
    filled,
    ["source:html_signals", "unit:custom_card"],
    fingerprintElement(ctx.$, el),
  );
}

function fillFieldsFromPage(
  ctx: SourceContext,
  fieldDefs: FieldConfig[],
): Record<string, ScoredValue> {
  return fillFieldsFromScope(ctx, undefined, fieldDefs);
}

function fillFieldsFromScope(
  ctx: SourceContext,
  el: Element | undefined,
  fieldDefs: FieldConfig[],
): Record<string, ScoredValue> {
  const $ = ctx.$;
  const text = el ? $(el).text() : $.root().text();
  const out: Record<string, ScoredValue> = {};

  for (const field of fieldDefs) {
    const type: FieldType = field.normalize ?? guessType(field.name);
    const scored = candidateForType(ctx, $, el, text, field, type);
    if (scored) out[field.name] = scored;
  }
  return out;
}

function guessType(name: string): FieldType {
  const n = name.toLowerCase();
  if (/(price|amount|cost)/.test(n)) return "money";
  if (/(url|href|link)/.test(n)) return "url";
  if (/(image|img|photo|thumb)/.test(n)) return "image";
  if (/(available|enabled|active|in_stock)/.test(n)) return "boolean";
  return "string";
}

function candidateForType(
  ctx: SourceContext,
  $: CheerioAPI,
  el: Element | undefined,
  text: string,
  field: FieldConfig,
  type: FieldType,
): ScoredValue | null {
  if (type === "money") return moneyCandidatesFromText(text)[0] ?? null;
  if (type === "boolean") {
    const byName = booleanCandidates(nearLabelText(text, field.name))[0];
    return byName ?? booleanCandidates(text)[0] ?? null;
  }
  if (type === "enum" && field.enumValues?.length) {
    const lower = text.toLowerCase();
    for (const v of field.enumValues) {
      if (lower.includes(v.toLowerCase())) {
        return { value: v, score: 0.75, reasons: [`enum:${field.name}`] };
      }
    }
    return null;
  }
  if (type === "url") {
    if (el) {
      const href = absoluteHref($(el).find("a[href]").first().attr("href"), ctx.url);
      if (href) return { value: href, score: 0.75, reasons: ["card:href"] };
    }
    return detailLinkCandidates($, undefined, ctx.url)[0] ?? null;
  }
  if (type === "image") {
    if (el) {
      const src = $(el).find("img[src],img[data-src]").first().attr("src") ||
        $(el).find("img").first().attr("data-src");
      if (src && !src.startsWith("data:")) {
        return {
          value: absoluteHref(src, ctx.url) ?? src,
          score: 0.7,
          reasons: ["card:img"],
        };
      }
    }
    return imageCandidates($, undefined, ctx.url)[0] ?? null;
  }

  // string / date-ish names
  if (field.name === "date" || /date|published|time/.test(field.name)) {
    return (el ? dateCandidates($, el) : dateCandidates($))[0] ?? null;
  }
  if (field.name === "title" || field.name === "label" || field.name === "name") {
    if (el) {
      const t =
        $(el).find("h1,h2,h3,h4,.title,[itemprop=name],[itemprop=headline]").first().text() ||
        $(el).find("a[href]").first().text();
      const cleaned = t.replace(/\s+/g, " ").trim();
      if (cleaned) return { value: cleaned, score: 0.8, reasons: ["card:title"] };
    }
    return titleCandidates($)[0] ?? null;
  }
  if (field.name === "excerpt" || field.name === "description") {
    const sel = el
      ? $(el).find("[itemprop=description], .excerpt, .summary, p").first().text()
      : $("[itemprop=description], .excerpt, .description, p").first().text();
    const cleaned = sel.replace(/\s+/g, " ").trim();
    if (cleaned) return { value: cleaned.slice(0, 500), score: 0.65, reasons: ["text:excerpt"] };
  }
  if (field.name === "availability") return availabilityCandidates(text)[0] ?? null;

  // generic string: data-attr / class name / labeled near text
  const attrHit =
    (el &&
      ($(el).attr(`data-${field.name}`) ||
        $(el).find(`[data-field=${field.name}], [itemprop=${field.name}]`).first().text())) ||
    $(`[data-field=${field.name}], [itemprop=${field.name}], .${field.name}`).first().text();
  if (attrHit?.trim()) {
    return {
      value: attrHit.trim().replace(/\s+/g, " ").slice(0, 500),
      score: 0.7,
      reasons: [`attr:${field.name}`],
    };
  }
  return null;
}

function nearLabelText(text: string, label: string): string {
  const re = new RegExp(`${label}[^\\n]{0,40}`, "i");
  const m = text.match(re);
  return m?.[0] ?? text.slice(0, 200);
}

function extractDetail(ctx: SourceContext): ExtractAttempt {
  const $ = ctx.$;
  const fields: Record<string, ScoredValue> = {};
  const titles = titleCandidates($);
  if (titles[0]) fields.title = titles[0];

  const bodyText = $("main, article, [itemtype*=Product], body").first().text();
  const money = moneyCandidatesFromText(bodyText);
  if (money[0]) fields.price = money[0];
  const cur = detectCurrency(bodyText);
  if (cur) fields.currency = { value: cur, score: 0.65, reasons: ["page:currency"] };

  const avail = availabilityCandidates(bodyText)[0];
  if (avail) fields.availability = avail;

  const images = imageCandidates($, undefined, ctx.url);
  if (images[0]) fields.image = images[0];

  fields.url = { value: ctx.url, score: 0.6, reasons: ["page:self"] };

  const desc = $("[itemprop=description], .description, #description").first().text().trim();
  if (desc) {
    fields.description = {
      value: desc.slice(0, 2000),
      score: 0.7,
      reasons: ["semantic:description"],
    };
  }

  const sku = $("[itemprop=sku], .sku").first().text().trim();
  if (sku) fields.sku = { value: sku, score: 0.75, reasons: ["semantic:sku"] };

  const item = scoredItem(fields, ["source:html_signals", "unit:detail"]);
  return {
    source: "html_signals",
    items: Object.keys(fields).length ? [item] : [],
    diagnostics: [
      {
        level: "info",
        code: "html_detail_extract",
        message: `Detail fields: ${Object.keys(fields).join(", ") || "(none)"}`,
      },
    ],
    scores: { detail: item.score },
  };
}

function extractPriceOnly(ctx: SourceContext): ExtractAttempt {
  const text = ctx.$("main, [itemtype*=Product], body").first().text();
  const money = moneyCandidatesFromText(text);
  if (!money.length) {
    return {
      source: "html_signals",
      items: [],
      diagnostics: [{ level: "warn", code: "no_price", message: "No price signals found" }],
      scores: { price: 0 },
    };
  }
  const fields: Record<string, ScoredValue> = { price: money[0]! };
  const cur = detectCurrency(text);
  if (cur) fields.currency = { value: cur, score: 0.7, reasons: ["page:currency"] };
  const title = titleCandidates(ctx.$)[0];
  if (title) fields.label = { ...title, reasons: [...title.reasons, "as:label"] };

  return {
    source: "html_signals",
    items: [{ fields, score: money[0]!.score, reasons: ["source:html_signals"] }],
    diagnostics: [{ level: "info", code: "price_only", message: "Price extracted from signals" }],
    scores: { price: money[0]!.score },
  };
}

export function extractWithFingerprint(
  ctx: SourceContext,
  fingerprints: string[],
): ExtractAttempt {
  const $ = ctx.$;
  const items: ItemCandidate[] = [];
  const all = $("li, article, div, section").toArray();
  for (const el of all) {
    if (el.type !== "tag") continue;
    const fp = fingerprintElement($ as CheerioAPI, el);
    if (fingerprints.some((f) => fp === f || fp.includes(f) || f.includes(fp.split("::")[0]!))) {
      let item: ItemCandidate | null = null;
      if (ctx.preset === "article_list") item = extractArticleCard(ctx, el);
      else if (ctx.preset === "custom") item = extractCustomCard(ctx, el, ctx.fields);
      else item = extractProductCard(ctx, el);
      if (item) items.push(item);
    }
  }
  return {
    source: "healed_rule",
    items,
    diagnostics: [
      {
        level: "info",
        code: "fingerprint_reuse",
        message: `Fingerprint match produced ${items.length} item(s)`,
      },
    ],
    scores: { fingerprintHits: items.length },
  };
}

function absoluteHref(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function scoredItem(
  fields: Record<string, ScoredValue>,
  reasons: string[],
  fingerprint?: string,
): ItemCandidate {
  const score =
    Object.values(fields).reduce((s, f) => s + f.score, 0) / Math.max(1, Object.keys(fields).length);
  return { fields, score, reasons, fingerprint };
}
