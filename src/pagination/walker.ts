import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { Diagnostic, Fetcher } from "../types.js";

export interface PaginationResult {
  pages: Array<{ url: string; html: string }>;
  diagnostics: Diagnostic[];
}

/**
 * Follow rel=next / ?page=N within budgets; stop on empty or duplicate pages.
 * Пагинация с лимитами: стоп на пустой или уже виденной странице.
 */
export async function walkPagination(input: {
  fetcher: Fetcher;
  startUrl: string;
  startHtml: string;
  maxPages: number;
  timeoutMs: number;
}): Promise<PaginationResult> {
  const diagnostics: Diagnostic[] = [];
  const pages: Array<{ url: string; html: string }> = [
    { url: input.startUrl, html: input.startHtml },
  ];
  const seenSig = new Set<string>([pageSignature(input.startHtml)]);
  const seenUrl = new Set<string>([canonicalize(input.startUrl)]);

  let currentUrl = input.startUrl;
  let currentHtml = input.startHtml;

  while (pages.length < input.maxPages) {
    const next = findNextUrl(currentHtml, currentUrl);
    if (!next) {
      diagnostics.push({
        level: "info",
        code: "pagination_end",
        message: "No next page link found",
      });
      break;
    }
    const canon = canonicalize(next);
    if (seenUrl.has(canon)) {
      diagnostics.push({
        level: "info",
        code: "pagination_cycle",
        message: `Pagination cycle at ${next}`,
      });
      break;
    }
    seenUrl.add(canon);

    try {
      const res = await input.fetcher.fetch(next, { timeoutMs: input.timeoutMs });
      if (res.status !== 200) {
        diagnostics.push({
          level: "warn",
          code: "pagination_http",
          message: `Next page HTTP ${res.status}`,
        });
        break;
      }
      const sig = pageSignature(res.body);
      if (seenSig.has(sig)) {
        diagnostics.push({
          level: "info",
          code: "pagination_dup_page",
          message: "Duplicate page signature — stop",
        });
        break;
      }
      seenSig.add(sig);
      pages.push({ url: res.finalUrl || next, html: res.body });
      currentUrl = res.finalUrl || next;
      currentHtml = res.body;
    } catch (err) {
      diagnostics.push({
        level: "warn",
        code: "pagination_fetch_error",
        message: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  diagnostics.push({
    level: "info",
    code: "pagination_done",
    message: `Collected ${pages.length} page(s)`,
  });
  return { pages, diagnostics };
}

export function findNextUrl(html: string, baseUrl: string): string | null {
  const $ = load(html);
  const rel = $('a[rel="next"], link[rel="next"]').first().attr("href");
  if (rel) return abs(rel, baseUrl);

  const candidates: string[] = [];
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    const text = $(el).text().toLowerCase().trim();
    if (!href) return;
    if (
      text === "next" ||
      text === "›" ||
      text === "»" ||
      text.includes("next") ||
      $(el).attr("aria-label")?.toLowerCase().includes("next")
    ) {
      candidates.push(href);
    }
  });
  if (candidates[0]) return abs(candidates[0], baseUrl);

  // Synthesize ?page=N+1 or /page/N+1
  try {
    const u = new URL(baseUrl);
    const pageParam = u.searchParams.get("page");
    if (pageParam && /^\d+$/.test(pageParam)) {
      u.searchParams.set("page", String(Number(pageParam) + 1));
      // Only if HTML hints pagination exists
      if (/[?&]page=\d+|rel=["']next["']|pagination/i.test(html)) return u.toString();
    }
    const m = u.pathname.match(/\/page\/(\d+)\/?$/i);
    if (m) {
      u.pathname = u.pathname.replace(/\/page\/\d+/i, `/page/${Number(m[1]) + 1}`);
      if (/pagination|page\//i.test(html)) return u.toString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function abs(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function canonicalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function pageSignature(html: string): string {
  const $ = load(html);
  const text = $("main, body").first().text().replace(/\s+/g, " ").slice(0, 2000);
  return createHash("sha256").update(text).digest("hex");
}
