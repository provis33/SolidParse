import type { CheerioAPI } from "cheerio";
import type { ScoredValue } from "../types.js";

const SKIP = /logo|icon|sprite|pixel|1x1|avatar|badge|banner|spacer/i;

export function imageCandidates($: CheerioAPI, scope?: string, baseUrl?: string): ScoredValue[] {
  const root = scope ? $(scope) : $.root();
  const out: ScoredValue[] = [];

  root.find("img[src], img[data-src]").each((_, el) => {
    const src = ($(el).attr("src") || $(el).attr("data-src") || "").trim();
    if (!src || src.startsWith("data:")) return;
    if (SKIP.test(src) || SKIP.test($(el).attr("alt") || "") || SKIP.test($(el).attr("class") || "")) {
      return;
    }
    const abs = absolutize(src, baseUrl);
    let score = 0.5;
    const reasons = ["tag:img"];
    if ($(el).closest("[itemtype*=Product], .product, .card").length) {
      score += 0.2;
      reasons.push("near:product_card");
    }
    const w = Number($(el).attr("width") || 0);
    const h = Number($(el).attr("height") || 0);
    if (w >= 80 && h >= 80) {
      score += 0.1;
      reasons.push("size:ok");
    }
    out.push({ value: abs, score, reasons });
  });

  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    out.push({
      value: absolutize(og, baseUrl),
      score: 0.7,
      reasons: ["og:image"],
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function absolutize(src: string, baseUrl?: string): string {
  if (!baseUrl) return src;
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}
