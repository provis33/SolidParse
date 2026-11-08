import { load } from "cheerio";
import type { ExtractAttempt, FieldConfig, Fetcher, TargetPreset } from "../types.js";
import { mineAndFetchApi } from "./api-mine.js";
import { embeddedExtractor } from "./embedded.js";
import { htmlSignalsExtractor } from "./html-signals.js";
import { jsonLdExtractor } from "./jsonld.js";
import { microdataExtractor } from "./microdata.js";
import { extractFromNetworkJson } from "./network.js";
import { openGraphExtractor } from "./opengraph.js";
import type { SourceContext } from "./types.js";

export function buildSourceContext(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
): SourceContext {
  return {
    $: load(html),
    html,
    url,
    preset,
    fields,
  };
}

/**
 * Sync priority: JSON-LD → microdata → embedded → OG → HTML signals.
 * Порядок источников. network + API mine подключаются в extractFromHtmlAsync.
 */
export function extractFromHtml(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
): ExtractAttempt {
  const ctx = buildSourceContext(html, url, preset, fields);
  const attempts: ExtractAttempt[] = [];

  for (const extractor of [
    jsonLdExtractor,
    microdataExtractor,
    embeddedExtractor,
    openGraphExtractor,
    htmlSignalsExtractor,
  ]) {
    const result = extractor.extract(ctx);
    if (result && result.items.length) attempts.push(result);
  }

  if (!attempts.length) {
    const fallback = htmlSignalsExtractor.extract(ctx);
    return (
      fallback ?? {
        source: "html_signals",
        items: [],
        diagnostics: [
          { level: "error", code: "empty_result", message: "No extractors produced items" },
        ],
        scores: {},
      }
    );
  }

  return pickBest(attempts, preset);
}

export async function extractFromHtmlAsync(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
  fetcher?: Fetcher,
  networkJson?: unknown[],
): Promise<ExtractAttempt> {
  const syncBest = extractFromHtml(html, url, preset, fields);
  const attempts: ExtractAttempt[] = [syncBest].filter((a) => a.items.length);

  if (networkJson?.length) {
    const net = extractFromNetworkJson(networkJson, { preset, url });
    if (net?.items.length) attempts.push(net);
  }

  if (fetcher) {
    const ctx = buildSourceContext(html, url, preset, fields);
    const api = await mineAndFetchApi(ctx, fetcher);
    if (api?.items.length) attempts.push(api);
  }

  if (!attempts.length) return syncBest;
  return pickBest(attempts, preset);
}

function pickBest(attempts: ExtractAttempt[], preset: TargetPreset): ExtractAttempt {
  const scored = attempts.map((a) => {
    const avg = a.items.reduce((s, i) => s + i.score, 0) / Math.max(1, a.items.length);
    const listBonus =
      (preset === "product_list" || preset === "article_list") && a.items.length >= 2 ? 0.1 : 0;
    const sourceBonus =
      a.source === "jsonld"
        ? 0.08
        : a.source === "network"
          ? 0.07
          : a.source === "microdata"
            ? 0.05
            : a.source === "api_mine"
              ? 0.04
              : 0;
    return { a, rank: avg + listBonus + sourceBonus + Math.min(0.1, a.items.length * 0.01) };
  });
  scored.sort((x, y) => y.rank - x.rank);
  return scored[0]!.a;
}

export { embeddedExtractor, htmlSignalsExtractor, jsonLdExtractor };
export { microdataExtractor } from "./microdata.js";
export { openGraphExtractor } from "./opengraph.js";
export { apiMineExtractor, mineEndpoints, mineAndFetchApi } from "./api-mine.js";
export { extractFromNetworkJson } from "./network.js";
export { extractWithFingerprint } from "./html-signals.js";
