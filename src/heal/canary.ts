import { parseBooleanValue } from "../signals/boolean.js";
import { parseMoneyAmount } from "../signals/money.js";
import type {
  CanaryMode,
  Diagnostic,
  FieldConfig,
  ItemCandidate,
} from "../types.js";

export interface CanaryBaseline {
  itemCount: number;
  prices: number[];
  titleLengths: number[];
}

export interface CanaryResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}

export function baselineFromPlain(items: Record<string, unknown>[]): CanaryBaseline {
  const prices: number[] = [];
  const titleLengths: number[] = [];
  for (const item of items) {
    if (typeof item.price === "number") prices.push(item.price);
    else if (typeof item.price === "string") {
      const n = parseMoneyAmount(item.price);
      if (n != null) prices.push(n);
    }
    if (typeof item.title === "string") titleLengths.push(item.title.length);
  }
  return { itemCount: items.length, prices, titleLengths };
}

export function baselineFromCandidates(items: ItemCandidate[]): CanaryBaseline {
  return baselineFromPlain(
    items.map((i) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(i.fields)) row[k] = v.value;
      return row;
    }),
  );
}

export function validateCanary(
  items: ItemCandidate[],
  fields: FieldConfig[],
  mode: CanaryMode,
  baseline: CanaryBaseline | null,
): CanaryResult {
  const diagnostics: Diagnostic[] = [];

  // Required fields
  const required = fields.filter((f) => f.required);
  for (const item of items) {
    for (const f of required) {
      if (item.fields[f.name] == null) {
        diagnostics.push({
          level: "error",
          code: "missing_required",
          message: `Missing required field: ${f.name}`,
        });
      }
    }
  }

  // Type checks
  for (const item of items) {
    for (const f of fields) {
      const scored = item.fields[f.name];
      if (!scored || !f.normalize) continue;
      if (f.normalize === "money") {
        const n =
          typeof scored.value === "number" ? scored.value : parseMoneyAmount(String(scored.value));
        if (n == null || !Number.isFinite(n) || n <= 0) {
          diagnostics.push({
            level: "error",
            code: "type_money",
            message: `Field ${f.name} is not a parseable money value`,
            details: { value: scored.value },
          });
        }
      }
      if (f.normalize === "url" || f.normalize === "image") {
        const okUrl =
          typeof scored.value === "string" &&
          (/^https?:\/\//i.test(scored.value) || scored.value.startsWith("/"));
        if (!okUrl) {
          diagnostics.push({
            level: "warn",
            code: "type_url",
            message: `Field ${f.name} looks like a weak URL`,
            details: { value: scored.value },
          });
        }
      }
      if (f.normalize === "boolean") {
        if (parseBooleanValue(scored.value) == null) {
          diagnostics.push({
            level: "error",
            code: "type_boolean",
            message: `Field ${f.name} is not a boolean value`,
            details: { value: scored.value },
          });
        }
      }
      if (f.normalize === "enum") {
        const allowed = f.enumValues ?? [];
        if (
          allowed.length > 0 &&
          (typeof scored.value !== "string" ||
            !allowed.some((v) => v.toLowerCase() === String(scored.value).toLowerCase()))
        ) {
          diagnostics.push({
            level: "error",
            code: "type_enum",
            message: `Field ${f.name} not in enumValues`,
            details: { value: scored.value, allowed },
          });
        }
      }
    }
  }

  if (!items.length) {
    diagnostics.push({
      level: "error",
      code: "canary_empty",
      message: "Canary: zero items",
    });
  }

  // Similarity vs last-good
  if (baseline && baseline.itemCount > 0 && mode !== "permissive") {
    const ratio = items.length / baseline.itemCount;
    const minRatio = mode === "strict" ? 0.7 : 0.4;
    const maxRatio = mode === "strict" ? 1.5 : 3.0;
    if (ratio < minRatio || ratio > maxRatio) {
      diagnostics.push({
        level: "error",
        code: "count_drift",
        message: `Item count ${items.length} vs baseline ${baseline.itemCount} outside ${mode} band`,
        details: { ratio, minRatio, maxRatio },
      });
    }

    const newPrices = baselineFromCandidates(items).prices;
    if (baseline.prices.length && newPrices.length) {
      const baseMed = median(baseline.prices);
      const newMed = median(newPrices);
      const drift = Math.abs(newMed - baseMed) / Math.max(baseMed, 1);
      const maxDrift = mode === "strict" ? 0.5 : 2.0;
      if (drift > maxDrift) {
        diagnostics.push({
          level: "error",
          code: "price_drift",
          message: `Median price drift ${drift.toFixed(2)} exceeds ${mode} threshold`,
          details: { baseMed, newMed, drift },
        });
      }
    }

    const newTitles = baselineFromCandidates(items).titleLengths;
    if (baseline.titleLengths.length && newTitles.length) {
      const baseMed = median(baseline.titleLengths);
      const newMed = median(newTitles);
      if (newMed < 2 || (mode === "strict" && (newMed < baseMed * 0.3 || newMed > baseMed * 4))) {
        diagnostics.push({
          level: "error",
          code: "title_length_drift",
          message: "Title length distribution looks suspicious vs baseline",
          details: { baseMed, newMed },
        });
      }
    }
  }

  const hardErrors = diagnostics.filter((d) => d.level === "error");
  // permissive: only required/type hard fails
  if (mode === "permissive") {
    const critical = hardErrors.filter((d) =>
      ["missing_required", "type_money", "type_boolean", "type_enum", "canary_empty"].includes(
        d.code,
      ),
    );
    return { ok: critical.length === 0 && items.length > 0, diagnostics };
  }

  return { ok: hardErrors.length === 0 && items.length > 0, diagnostics };
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
