import type { ScoredValue } from "../types.js";

const PATTERNS: Array<{ re: RegExp; value: string; score: number }> = [
  { re: /\bin stock\b|\bavailable\b|\bin_stock\b|в наличии/i, value: "in_stock", score: 0.85 },
  { re: /\bout of stock\b|\bsold out\b|\bunavailable\b|нет в наличии/i, value: "out_of_stock", score: 0.9 },
  { re: /\bpreorder\b|\bpre-order\b/i, value: "preorder", score: 0.8 },
  { re: /\blimited\b|\bfew left\b/i, value: "limited", score: 0.7 },
];

export function availabilityCandidates(text: string): ScoredValue[] {
  const out: ScoredValue[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      out.push({
        value: p.value,
        score: p.score,
        reasons: [`availability_keyword:${p.value}`],
      });
    }
  }
  return out;
}
