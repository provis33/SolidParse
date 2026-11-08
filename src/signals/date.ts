import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ScoredValue } from "../types.js";

const DATE_RE =
  /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i;

export function dateCandidates($: CheerioAPI, scopeEl?: Element): ScoredValue[] {
  const out: ScoredValue[] = [];

  const nodes = scopeEl
    ? $(scopeEl).find("time[datetime], [itemprop=datePublished], [itemprop=dateCreated]")
    : $("time[datetime], [itemprop=datePublished], [itemprop=dateCreated]");
  nodes.each((_, el) => {
    const dt = $(el).attr("datetime") || $(el).attr("content") || $(el).text();
    const normalized = normalizeDate(dt);
    if (normalized) {
      out.push({
        value: normalized,
        score: 0.9,
        reasons: ["semantic:time"],
      });
    }
  });

  const text = (scopeEl ? $(scopeEl).text() : $.root().text());
  const m = text.match(DATE_RE);
  if (m?.[0]) {
    const normalized = normalizeDate(m[0]);
    if (normalized) {
      out.push({ value: normalized, score: 0.55, reasons: ["date_pattern"] });
    }
  }

  return dedupe(out);
}

export function dateCandidatesFromText(text: string): ScoredValue[] {
  const m = text.match(DATE_RE);
  if (!m?.[0]) return [];
  const normalized = normalizeDate(m[0]);
  if (!normalized) return [];
  return [{ value: normalized, score: 0.5, reasons: ["date_pattern"] }];
}

export function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = Date.parse(t);
  if (Number.isFinite(iso)) return new Date(iso).toISOString().slice(0, 10);
  if (DATE_RE.test(t)) return t.slice(0, 32);
  return null;
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

export function hasDateSignal($: CheerioAPI, el: AnyNode): boolean {
  const node = el.type === "tag" ? (el as Element) : null;
  if (!node) return false;
  return (
    $(node).find("time, [itemprop=datePublished]").length > 0 ||
    DATE_RE.test($(node).text().slice(0, 400))
  );
}
