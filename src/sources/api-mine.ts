import type { ExtractAttempt, Fetcher, ItemCandidate, ScoredValue } from "../types.js";
import type { SourceContext, SourceExtractor } from "./types.js";

const ENDPOINT_RE =
  /["'`]((?:https?:\/\/[^"'`\s]+)?(?:\/api\/[^"'`\s]+|[^"'`\s]+\.json(?:\?[^"'`\s]*)?))["'`]/gi;

/**
 * Find API/JSON URLs in HTML, then same-origin fetch when a fetcher is given.
 * Ищем эндпоинты в HTML и при наличии fetcher'а тянем JSON с того же origin.
 */
export function createApiMineExtractor(fetcher?: Fetcher): SourceExtractor {
  return {
    name: "api_mine",
    extract(ctx: SourceContext): ExtractAttempt | null {
      // List endpoints only; real JSON fetch is mineAndFetchApi.
      // Тут только список URL; сеть — в mineAndFetchApi.
      const endpoints = mineEndpoints(ctx.html, ctx.url);
      if (!endpoints.length) return null;

      void fetcher;
      return {
        source: "api_mine",
        items: [],
        diagnostics: [
          {
            level: "info",
            code: "api_endpoints_found",
            message: `Found ${endpoints.length} candidate API endpoint(s)`,
            details: { endpoints: endpoints.slice(0, 10) },
          },
        ],
        scores: { apiEndpoints: endpoints.length },
      };
    },
  };
}

export const apiMineExtractor = createApiMineExtractor();

export function mineEndpoints(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(ENDPOINT_RE.source, ENDPOINT_RE.flags);
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!;
    try {
      const abs = new URL(raw, baseUrl);
      if (abs.origin === new URL(baseUrl).origin || raw.startsWith("/")) {
        out.add(abs.toString());
      }
    } catch {
      /* skip */
    }
  }
  return [...out].slice(0, 20);
}

export async function mineAndFetchApi(
  ctx: SourceContext,
  fetcher: Fetcher,
): Promise<ExtractAttempt | null> {
  const endpoints = mineEndpoints(ctx.html, ctx.url);
  if (!endpoints.length) return null;

  const items: ItemCandidate[] = [];
  const diagnostics = [
    {
      level: "info" as const,
      code: "api_mine_start",
      message: `Trying ${Math.min(3, endpoints.length)} mined endpoint(s)`,
    },
  ];

  for (const ep of endpoints.slice(0, 3)) {
    try {
      const res = await fetcher.fetch(ep);
      if (res.status !== 200) continue;
      const json = JSON.parse(res.body) as unknown;
      const products = flattenProductish(json);
      for (const p of products.slice(0, 100)) {
        const fields: Record<string, ScoredValue> = {};
        if (p.title || p.name) {
          fields.title = {
            value: String(p.title || p.name),
            score: 0.85,
            reasons: ["api_mine:title"],
          };
        }
        const price = p.price ?? p.amount;
        if (price != null && Number.isFinite(Number(price))) {
          fields.price = {
            value: Number(price),
            score: 0.85,
            reasons: ["api_mine:price"],
          };
        }
        if (p.url || p.href) {
          fields.url = {
            value: String(p.url || p.href),
            score: 0.8,
            reasons: ["api_mine:url"],
          };
        }
        if (p.image || p.imageUrl) {
          fields.image = {
            value: String(p.image || p.imageUrl),
            score: 0.75,
            reasons: ["api_mine:image"],
          };
        }
        if (Object.keys(fields).length >= 2) {
          const score =
            Object.values(fields).reduce((s, f) => s + f.score, 0) / Object.keys(fields).length;
          items.push({ fields, score, reasons: ["source:api_mine"] });
        }
      }
      if (items.length) {
        diagnostics.push({
          level: "info",
          code: "api_mine_hit",
          message: `API ${ep} yielded ${items.length} item(s)`,
        });
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (!items.length) {
    return {
      source: "api_mine",
      items: [],
      diagnostics: [
        ...diagnostics,
        { level: "info", code: "api_mine_empty", message: "No usable API payloads" },
      ],
      scores: { apiEndpoints: endpoints.length },
    };
  }

  return {
    source: "api_mine",
    items,
    diagnostics,
    scores: { api_mine: items.reduce((s, i) => s + i.score, 0) / items.length },
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
    for (const key of ["products", "items", "results", "data"]) {
      if (obj[key]) {
        const found = flattenProductish(obj[key], depth + 1);
        if (found.length) return found;
      }
    }
  }
  return [];
}
