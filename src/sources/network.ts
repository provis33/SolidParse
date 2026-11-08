import type { ExtractAttempt, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext } from "./types.js";

/**
 * Turn sniffed (or test-injected) XHR/fetch JSON into extract items.
 * JSON из сети браузера (или подставленный в тестах) → кандидаты товаров.
 */
export function extractFromNetworkJson(
  payloads: unknown[],
  ctx: Pick<SourceContext, "preset" | "url">,
): ExtractAttempt | null {
  if (!payloads.length) return null;
  const items: ItemCandidate[] = [];

  for (const payload of payloads) {
    for (const p of flattenProductish(payload)) {
      const fields: Record<string, ScoredValue> = {};
      if (p.title || p.name) {
        fields.title = {
          value: String(p.title || p.name),
          score: 0.88,
          reasons: ["network:title"],
        };
      }
      const price = p.price ?? p.amount ?? p.salePrice;
      if (price != null && Number.isFinite(Number(price))) {
        fields.price = {
          value: Number(price),
          score: 0.88,
          reasons: ["network:price"],
        };
      }
      if (p.currency || p.currencyCode) {
        fields.currency = {
          value: String(p.currency || p.currencyCode),
          score: 0.8,
          reasons: ["network:currency"],
        };
      }
      if (p.url || p.href || p.link) {
        fields.url = {
          value: String(p.url || p.href || p.link),
          score: 0.85,
          reasons: ["network:url"],
        };
      }
      if (p.image || p.imageUrl || p.thumbnail) {
        fields.image = {
          value: String(p.image || p.imageUrl || p.thumbnail),
          score: 0.8,
          reasons: ["network:image"],
        };
      }
      if (Object.keys(fields).length >= 2) {
        const score =
          Object.values(fields).reduce((s, f) => s + f.score, 0) / Object.keys(fields).length;
        items.push({ fields, score, reasons: ["source:network"] });
      }
    }
  }

  if (!items.length) return null;

  return {
    source: "network",
    items:
      ctx.preset === "product_detail" || ctx.preset === "price_only"
        ? items.slice(0, 1)
        : items.slice(0, 200),
    diagnostics: [
      {
        level: "info",
        code: "network_hit",
        message: `Extracted ${items.length} item(s) from network JSON`,
      },
    ],
    scores: { network: items.reduce((s, i) => s + i.score, 0) / items.length },
  };
}

function flattenProductish(node: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6 || node == null) return [];
  if (Array.isArray(node)) {
    if (
      node.length &&
      node.every(
        (x) =>
          x &&
          typeof x === "object" &&
          ("price" in (x as object) || "name" in (x as object) || "title" in (x as object)),
      )
    ) {
      return node as Array<Record<string, unknown>>;
    }
    return node.flatMap((x) => flattenProductish(x, depth + 1));
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of ["products", "items", "results", "data", "catalog"]) {
      if (obj[key]) {
        const found = flattenProductish(obj[key], depth + 1);
        if (found.length) return found;
      }
    }
  }
  return [];
}
