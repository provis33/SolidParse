import { load } from "cheerio";
import type { BudgetConfig, Diagnostic, Fetcher, TargetPreset } from "../types.js";
import { scorePageForTarget } from "./score-page.js";
import { fetchSitemapUrls } from "./sitemap.js";

export interface DiscoveryHit {
  url: string;
  score: number;
  html: string;
}

export interface DiscoveryResult {
  hits: DiscoveryHit[];
  best: DiscoveryHit | null;
  diagnostics: Diagnostic[];
}

export async function discoverPages(input: {
  fetcher: Fetcher;
  startUrl: string;
  preset: TargetPreset;
  budgets: BudgetConfig;
}): Promise<DiscoveryResult> {
  const diagnostics: Diagnostic[] = [];
  const started = Date.now();
  const origin = new URL(input.startUrl).origin;
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: input.startUrl, depth: 0 }];
  const hits: DiscoveryHit[] = [];

  // Seed from sitemap
  const sm = await fetchSitemapUrls(input.fetcher, origin, input.budgets.maxPages);
  if (sm.length) {
    diagnostics.push({
      level: "info",
      code: "sitemap_seed",
      message: `Seeded ${sm.length} URL(s) from sitemap`,
    });
    for (const u of sm.slice(0, Math.min(10, input.budgets.maxPages))) {
      queue.push({ url: u, depth: 1 });
    }
  }

  while (queue.length && visited.size < input.budgets.maxPages) {
    if (Date.now() - started > input.budgets.timeBudgetMs) {
      diagnostics.push({
        level: "warn",
        code: "time_budget",
        message: "Discovery stopped: time budget exhausted",
      });
      break;
    }

    const batch = queue.splice(0, input.budgets.concurrency);
    await Promise.all(
      batch.map(async ({ url, depth }) => {
        if (visited.has(url) || visited.size >= input.budgets.maxPages) return;
        visited.add(url);
        try {
          const res = await input.fetcher.fetch(url, {
            timeoutMs: input.budgets.requestTimeoutMs,
          });
          if (res.status !== 200) return;
          if (!/text\/html|application\/xhtml/i.test(res.headers["content-type"] || "text/html") &&
              !res.body.includes("<html")) {
            return;
          }
          const score = scorePageForTarget(res.body, input.preset);
          if (score >= 0.25) {
            hits.push({ url: res.finalUrl || url, score, html: res.body });
          }
          if (depth < input.budgets.maxDepth) {
            const links = extractInternalLinks(res.body, origin, res.finalUrl || url);
            for (const link of links) {
              if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
            }
          }
        } catch {
          /* skip */
        }
      }),
    );
  }

  hits.sort((a, b) => b.score - a.score);
  diagnostics.push({
    level: "info",
    code: "discovery_done",
    message: `Visited ${visited.size} page(s), ${hits.length} scored hit(s)`,
  });

  return { hits, best: hits[0] ?? null, diagnostics };
}

function extractInternalLinks(html: string, origin: string, baseUrl: string): string[] {
  const $ = load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      return;
    }
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin !== origin) return;
      abs.hash = "";
      out.push(abs.toString());
    } catch {
      /* ignore */
    }
  });
  return [...new Set(out)].slice(0, 50);
}
