import type { ScoredValue } from "../types.js";

const MONEY_RE =
  /(?:(?:USD|EUR|GBP|RUB|JPY|CNY|INR|KRW|₽|\$|€|£|¥|₹|₩)\s*)?(\d{1,3}(?:[ \u00a0.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:USD|EUR|GBP|RUB|JPY|CNY|INR|KRW|руб\.?|₽|\$|€|£|¥|₹|₩))?/gi;

const CURRENCY_MAP: Array<{ re: RegExp; code: string }> = [
  { re: /\$|USD/i, code: "USD" },
  { re: /€|EUR/i, code: "EUR" },
  { re: /£|GBP/i, code: "GBP" },
  { re: /₽|RUB|руб/i, code: "RUB" },
  { re: /¥|JPY|円/i, code: "JPY" },
  { re: /₹|INR/i, code: "INR" },
  { re: /₩|KRW/i, code: "KRW" },
  { re: /CNY|RMB|元/i, code: "CNY" },
];

export interface MoneyHit {
  raw: string;
  amount: number;
  currency: string | null;
  index: number;
}

export function parseMoneyAmount(raw: string): number | null {
  let cleaned = raw.replace(/[^\d.,\s\u00a0]/g, "").trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/[\s\u00a0]/g, "");

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    // EU: 1.299,00 vs US: 1,299.00
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    const parts = normalized.split(",");
    normalized =
      parts.length === 2 && parts[1]!.length <= 2
        ? `${parts[0]}.${parts[1]}`
        : normalized.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    // 1.299.000 thousands (EU) without decimals
    normalized = normalized.replace(/\./g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function detectCurrency(text: string): string | null {
  for (const { re, code } of CURRENCY_MAP) {
    if (re.test(text)) return code;
  }
  return null;
}

export function findMoneyHits(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re = new RegExp(MONEY_RE.source, MONEY_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const amount = parseMoneyAmount(m[1] ?? raw);
    if (amount == null || amount <= 0 || amount > 1_000_000_000) continue;
    if (/^(19|20)\d{2}$/.test((m[1] ?? "").replace(/\D/g, "")) && !/[\$€£₽¥₹₩]/.test(raw)) {
      continue;
    }
    const window = text.slice(Math.max(0, m.index - 6), m.index + raw.length + 6);
    hits.push({
      raw: raw.trim(),
      amount,
      currency: detectCurrency(raw) ?? detectCurrency(window),
      index: m.index,
    });
  }
  return hits;
}

export function moneyCandidatesFromText(text: string): ScoredValue[] {
  return findMoneyHits(text).map((h) => ({
    value: h.amount,
    score: 0.55 + (h.currency ? 0.2 : 0) + (h.amount > 0 ? 0.1 : 0),
    reasons: [
      `money_pattern:${h.raw}`,
      h.currency ? `currency:${h.currency}` : "currency:unknown",
    ],
  }));
}
