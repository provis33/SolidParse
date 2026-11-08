import type { CheerioAPI } from "cheerio";
import type { ScoredValue } from "../types.js";

const NOISE =
  /^(home|menu|cart|login|sign in|subscribe|cookie|privacy|terms|search|filter|sort)$/i;

export function titleCandidates($: CheerioAPI, scope?: string): ScoredValue[] {
  const root = scope ? $(scope) : $.root();
  const out: ScoredValue[] = [];

  const push = (text: string, score: number, reason: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 200 || NOISE.test(t)) return;
    out.push({ value: t, score, reasons: [reason] });
  };

  root.find("h1").each((_, el) => push($(el).text(), 0.9, "tag:h1"));
  root.find("h2").each((_, el) => push($(el).text(), 0.75, "tag:h2"));
  root.find("h3").each((_, el) => push($(el).text(), 0.65, "tag:h3"));
  root.find("[itemprop=name], [data-testid*=title i], .product-title, .card-title").each((_, el) => {
    push($(el).text(), 0.85, "semantic:title");
  });
  root.find("a[href]").each((_, el) => {
    const t = $(el).text();
    if (t.trim().split(/\s+/).length >= 2) push(t, 0.45, "link_text");
  });

  const og = $('meta[property="og:title"]').attr("content");
  if (og) push(og, 0.8, "og:title");

  return dedupe(out);
}

function dedupe(values: ScoredValue[]): ScoredValue[] {
  const seen = new Map<string, ScoredValue>();
  for (const v of values) {
    const key = String(v.value).toLowerCase();
    const prev = seen.get(key);
    if (!prev || prev.score < v.score) seen.set(key, v);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}
