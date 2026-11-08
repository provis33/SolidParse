import { createHash } from "node:crypto";
import { load } from "cheerio";

export interface LayoutFingerprint {
  hash: string;
  tagSeq: string;
  depthHist: number[];
}

export function layoutFingerprint(html: string): LayoutFingerprint {
  const $ = load(html);
  const tags: string[] = [];
  const depthHist = new Array(12).fill(0) as number[];

  const walk = (el: ReturnType<typeof $>[0], depth: number) => {
    if (!el || el.type !== "tag") return;
    const tag = el.tagName?.toLowerCase() || "?";
    if (!["script", "style", "noscript", "svg", "path"].includes(tag)) {
      tags.push(tag);
      const d = Math.min(depth, depthHist.length - 1);
      depthHist[d]!++;
    }
    for (const child of $(el).children().toArray().slice(0, 40)) {
      walk(child, depth + 1);
    }
  };

  $("body")
    .children()
    .toArray()
    .slice(0, 30)
    .forEach((c) => walk(c, 0));

  const tagSeq = tags.slice(0, 80).join(">");
  const hash = createHash("sha256")
    .update(tagSeq + "|" + depthHist.join(","))
    .digest("hex")
    .slice(0, 24);

  return { hash, tagSeq, depthHist };
}

/** 0 = same structure, 1 = totally different / 0 одинаково, 1 совсем другое */
export function layoutDistance(a: LayoutFingerprint, b: LayoutFingerprint): number {
  if (a.hash === b.hash) return 0;
  const sa = new Set(a.tagSeq.split(">").filter(Boolean));
  const sb = new Set(b.tagSeq.split(">").filter(Boolean));
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = new Set([...sa, ...sb]).size;
  const jaccard = union ? inter / union : 0;
  let histDiff = 0;
  for (let i = 0; i < a.depthHist.length; i++) {
    histDiff += Math.abs((a.depthHist[i] ?? 0) - (b.depthHist[i] ?? 0));
  }
  const histNorm = Math.min(1, histDiff / 100);
  return Math.min(1, (1 - jaccard) * 0.7 + histNorm * 0.3);
}

export function classifyLayoutChange(
  prev: LayoutFingerprint | null,
  nextHtml: string,
): { distance: number; kind: "same" | "selector_drift" | "content_moved" } {
  if (!prev) return { distance: 0, kind: "same" };
  const next = layoutFingerprint(nextHtml);
  const distance = layoutDistance(prev, next);
  if (distance < 0.25) return { distance, kind: "same" };
  if (distance < 0.65) return { distance, kind: "selector_drift" };
  return { distance, kind: "content_moved" };
}
