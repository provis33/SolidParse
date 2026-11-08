import { load } from "cheerio";
import { findCardClusters } from "../signals/cards.js";
import { findMoneyHits } from "../signals/money.js";
import type { TargetPreset } from "../types.js";

export function scorePageForTarget(html: string, preset: TargetPreset): number {
  const $ = load(html);
  const text = $.root().text();
  let score = 0;

  if (preset === "article_list") {
    const clusters = findCardClusters($, "article");
    if (clusters[0]) score += Math.min(0.55, clusters[0].score);
    if ($("time, [itemprop=datePublished]").length) score += 0.15;
    if (/article|blog|news|post/i.test(text.slice(0, 2000))) score += 0.1;
    return Math.min(1, score);
  }

  if (preset === "availability") {
    if (/\bin stock\b|\bout of stock\b|\bsold out\b|в наличии|нет в наличии/i.test(text)) {
      score += 0.5;
    }
    if ($("[itemprop=availability]").length) score += 0.25;
    if ($("h1").length) score += 0.1;
    return Math.min(1, score);
  }

  const money = findMoneyHits(text);
  if (money.length) score += Math.min(0.4, money.length * 0.05);

  if (preset === "product_list" || preset === "custom") {
    const clusters = findCardClusters($, preset === "custom" ? "generic" : "product");
    if (clusters[0]) score += Math.min(0.5, clusters[0].score);
  }

  if (preset === "product_detail" || preset === "price_only") {
    if ($("h1").length) score += 0.15;
    if (money.length) score += 0.2;
  }

  if (/product|catalog|shop|price|cart/i.test(text.slice(0, 2000))) score += 0.1;

  return Math.min(1, score);
}
