import type { Fetcher } from "../types.js";

export async function fetchSitemapUrls(
  fetcher: Fetcher,
  origin: string,
  limit: number,
): Promise<string[]> {
  const candidates = [
    new URL("/sitemap.xml", origin).toString(),
    new URL("/sitemap_index.xml", origin).toString(),
  ];

  for (const sm of candidates) {
    try {
      const res = await fetcher.fetch(sm);
      if (res.status !== 200) continue;
      const locs = [...res.body.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
        m[1]!.trim(),
      );
      if (locs.length) return locs.slice(0, limit);
    } catch {
      /* try next */
    }
  }
  return [];
}
