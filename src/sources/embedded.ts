import type { ExtractAttempt, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";

/**
 * __NEXT_DATA__ and obvious inline JSON blobs.
 * Вытаскиваем встроенный JSON (Next и похожие blob'ы в странице).
 */
export const embeddedExtractor: SourceExtractor = {
  name: "embedded",
  extract(ctx: SourceContext): ExtractAttempt | null {
    const payloads: unknown[] = [];

    const next = ctx.$("#__NEXT_DATA__").text();
    if (next) {
      try {
        payloads.push(JSON.parse(next));
      } catch {
        /* ignore */
      }
    }

    ctx.$("script:not([src])").each((_, el) => {
      const text = ctx.$(el).text();
      if (text.length < 20 || text.length > 500_000) return;
      const m = text.match(/(\{[\s\S]*"products?"[\s\S]*\})/);
      if (m?.[1]) {
        try {
          payloads.push(JSON.parse(m[1]));
        } catch {
          /* ignore */
        }
      }
    });

    if (!payloads.length) return null;

    const products = findProductish(payloads);
    if (!products.length) return null;

    const items: ItemCandidate[] = products.map((p) => {
      const fields: Record<string, ScoredValue> = {};
      if (p.title || p.name) {
        fields.title = {
          value: String(p.title || p.name),
          score: 0.8,
          reasons: ["embedded:title"],
        };
      }
      const price = p.price ?? p.amount ?? p.salePrice;
      if (price != null && Number.isFinite(Number(price))) {
        fields.price = {
          value: Number(price),
          score: 0.8,
          reasons: ["embedded:price"],
        };
      }
      if (p.currency || p.currencyCode) {
        fields.currency = {
          value: String(p.currency || p.currencyCode),
          score: 0.75,
          reasons: ["embedded:currency"],
        };
      }
      if (p.url || p.href || p.slug) {
        const url = p.url || p.href || (p.slug ? `/product/${p.slug}` : null);
        if (url) fields.url = { value: String(url), score: 0.7, reasons: ["embedded:url"] };
      }
      if (p.image || p.imageUrl) {
        fields.image = {
          value: String(p.image || p.imageUrl),
          score: 0.7,
          reasons: ["embedded:image"],
        };
      }
      const score =
        Object.values(fields).reduce((s, f) => s + f.score, 0) /
        Math.max(1, Object.keys(fields).length);
      return { fields, score, reasons: ["source:embedded"] };
    });

    const usable = items.filter((i) => Object.keys(i.fields).length > 0);
    if (!usable.length) return null;

    return {
      source: "embedded",
      items: usable,
      diagnostics: [
        {
          level: "info",
          code: "embedded_hit",
          message: `Extracted ${usable.length} item(s) from embedded JSON`,
        },
      ],
      scores: { embedded: usable.reduce((s, i) => s + i.score, 0) / usable.length },
    };
  },
};

function findProductish(nodes: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      // array of product-like objects
      if (
        node.length >= 2 &&
        node.every(
          (x) =>
            x &&
            typeof x === "object" &&
            ("price" in (x as object) || "name" in (x as object) || "title" in (x as object)),
        )
      ) {
        for (const x of node) out.push(x as Record<string, unknown>);
        return;
      }
      node.slice(0, 50).forEach((x) => visit(x, depth + 1));
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const key of ["products", "items", "results", "catalog"]) {
        if (obj[key]) visit(obj[key], depth + 1);
      }
      if ("props" in obj) visit(obj.props, depth + 1);
      if ("pageProps" in obj) visit(obj.pageProps, depth + 1);
    }
  };
  nodes.forEach((n) => visit(n, 0));
  return out.slice(0, 200);
}
