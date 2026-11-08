import type { CheerioAPI } from "cheerio";
import type { ScoredValue } from "../types.js";

const DETAIL_HINT =
  /\/(product|item|p|goods|catalog|shop)\/|\/products\/|id=|sku=/i;

export function detailLinkCandidates(
  $: CheerioAPI,
  scope?: string,
  baseUrl?: string,
): ScoredValue[] {
  const root = scope ? $(scope) : $.root();
  const out: ScoredValue[] = [];

  root.find("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const abs = absolutize(href, baseUrl);
    let score = 0.35;
    const reasons = ["tag:a"];
    if (DETAIL_HINT.test(abs)) {
      score += 0.35;
      reasons.push("url:detail_pattern");
    }
    if ($(el).closest(".product, .card, [itemtype*=Product], li").length) {
      score += 0.15;
      reasons.push("near:card");
    }
    out.push({ value: abs, score, reasons });
  });

  return dedupe(out);
}

function absolutize(href: string, baseUrl?: string): string {
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function dedupe(values: ScoredValue[]): ScoredValue[] {
  const seen = new Map<string, ScoredValue>();
  for (const v of values) {
    const key = String(v.value);
    const prev = seen.get(key);
    if (!prev || prev.score < v.score) seen.set(key, v);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}
