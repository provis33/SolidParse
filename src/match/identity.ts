import { createHash } from "node:crypto";
import type { ItemCandidate } from "../types.js";

export function itemIdentity(item: ItemCandidate): string {
  const sku = item.fields.sku?.value;
  if (typeof sku === "string" && sku.trim()) return `sku:${sku.trim().toLowerCase()}`;

  const url = item.fields.url?.value;
  if (typeof url === "string" && url.trim()) {
    try {
      const u = new URL(url);
      u.hash = "";
      return `url:${u.toString()}`;
    } catch {
      return `url:${url.trim()}`;
    }
  }

  const title = String(item.fields.title?.value ?? "").toLowerCase().trim();
  const price = String(item.fields.price?.value ?? "");
  const h = createHash("sha1").update(`${title}|${price}`).digest("hex").slice(0, 16);
  return `hash:${h}`;
}

export function assignIdentities(items: ItemCandidate[]): ItemCandidate[] {
  return items.map((item) => ({ ...item, identity: itemIdentity(item) }));
}
