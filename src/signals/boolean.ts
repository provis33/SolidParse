import type { ScoredValue } from "../types.js";

const TRUE_RE = /\b(true|yes|on|enabled|active|available|in stock|да)\b/i;
const FALSE_RE = /\b(false|no|off|disabled|inactive|unavailable|out of stock|нет)\b/i;

export function booleanCandidates(text: string): ScoredValue[] {
  const out: ScoredValue[] = [];
  if (FALSE_RE.test(text)) {
    out.push({ value: false, score: 0.75, reasons: ["boolean:false_keyword"] });
  }
  if (TRUE_RE.test(text)) {
    out.push({ value: true, score: 0.7, reasons: ["boolean:true_keyword"] });
  }
  return out;
}

export function parseBooleanValue(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (["true", "yes", "1", "on", "да"].includes(t)) return true;
  if (["false", "no", "0", "off", "нет"].includes(t)) return false;
  return null;
}
