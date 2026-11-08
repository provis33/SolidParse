import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface CardCluster {
  selectorHint: string;
  elements: Element[];
  score: number;
  reasons: string[];
}

function asElement(node: AnyNode | null | undefined): Element | null {
  if (!node || node.type !== "tag") return null;
  return node;
}

export type ClusterMode = "product" | "article" | "generic";

/**
 * Repeated sibling blocks that look like product/article cards.
 * Повторяющиеся соседние блоки — похоже на карточки товаров/статей.
 */
export function findCardClusters(
  $: CheerioAPI,
  mode: ClusterMode = "generic",
): CardCluster[] {
  const clusters: CardCluster[] = [];

  const containers = $("ul, ol, div, section, main").toArray();
  for (const container of containers) {
    const children = $(container)
      .children()
      .toArray()
      .map((c: AnyNode) => asElement(c))
      .filter((c: Element | null): c is Element => c != null);
    if (children.length < 2) continue;

    const signatures = children.map((c: Element) => signature($, c));
    const freq = new Map<string, Element[]>();
    for (let i = 0; i < children.length; i++) {
      const sig = signatures[i]!;
      const text = $(children[i]!).text();
      const looksUseful =
        sig.includes("a") ||
        sig.includes("img") ||
        /\$|price|h[123]/i.test(text) ||
        (mode === "article" &&
          (/time|date|excerpt|article/i.test(sig + text) ||
            $(children[i]!).find("time,h2,h3").length > 0));
      if (!looksUseful) continue;
      const list = freq.get(sig) ?? [];
      list.push(children[i]!);
      freq.set(sig, list);
    }

    for (const [sig, els] of freq) {
      if (els.length < 2) continue;
      let score = Math.min(0.9, 0.35 + els.length * 0.05);
      const reasons = [`repeat:${els.length}`, `sig:${sig}`];
      const sample = $(els[0]!);
      const sampleText = sample.text();
      if (/\$|€|£|₽|\d+[.,]\d{2}/.test(sampleText)) {
        score += mode === "article" ? 0.02 : 0.15;
        reasons.push("has:price_signal");
      }
      if (sample.find("img").length) {
        score += 0.05;
        reasons.push("has:image");
      }
      if (sample.find("time, [itemprop=datePublished]").length || /\d{4}/.test(sampleText)) {
        score += mode === "article" ? 0.18 : 0.05;
        reasons.push("has:date_signal");
      }
      if (mode === "article" && sample.is("article")) {
        score += 0.1;
        reasons.push("tag:article");
      }
      const parentClass = `${$(container).attr("class") || ""} ${$(container).attr("id") || ""}`;
      if (/nav|menu|footer|header|breadcrumb/i.test(parentClass)) {
        score -= 0.4;
        reasons.push("penalty:chrome");
      }
      clusters.push({
        selectorHint: describePath($, els[0]!),
        elements: els,
        score,
        reasons,
      });
    }
  }

  return clusters.sort((a, b) => b.score - a.score);
}

function signature($: CheerioAPI, el: Element): string {
  const tag = el.tagName?.toLowerCase() || "node";
  const childTags = $(el)
    .children()
    .toArray()
    .slice(0, 6)
    .map((c: AnyNode) => asElement(c)?.tagName?.toLowerCase() || "?")
    .join(">");
  const hasImg = $(el).find("img").length > 0 ? "img" : "";
  const hasA = $(el).find("a").length > 0 ? "a" : "";
  const hasPrice = /\$|€|£|₽|price/i.test($(el).text()) ? "price" : "";
  return [tag, childTags, hasImg, hasA, hasPrice].filter(Boolean).join("|");
}

export function describePath($: CheerioAPI, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; i < 5 && cur; i++) {
    const tag = cur.tagName?.toLowerCase() || "node";
    const cls = ($(cur).attr("class") || "").split(/\s+/).filter(Boolean)[0];
    parts.unshift(cls ? `${tag}.${cls}` : tag);
    cur = asElement($(cur).parent().get(0) ?? null);
  }
  return parts.join(">");
}

export function fingerprintElement($: CheerioAPI, el: Element): string {
  return signature($, el) + "::" + describePath($, el);
}
