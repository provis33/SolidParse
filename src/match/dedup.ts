import type { ItemCandidate } from "../types.js";
import { assignIdentities } from "./identity.js";

export function dedupeItems(items: ItemCandidate[]): ItemCandidate[] {
  const withId = assignIdentities(items);
  const seen = new Map<string, ItemCandidate>();
  for (const item of withId) {
    const id = item.identity!;
    const prev = seen.get(id);
    if (!prev || prev.score < item.score) seen.set(id, item);
  }
  return [...seen.values()];
}
