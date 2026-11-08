import type { ExtractAttempt, FieldConfig, ItemCandidate } from "../types.js";
import { filterItems } from "./filter.js";

export function scoreAndFilter(
  attempt: ExtractAttempt,
  fields: FieldConfig[],
): { items: ItemCandidate[]; scores: Record<string, number> } {
  const filtered = filterItems(attempt.items, fields);
  const ranked = [...filtered].sort((a, b) => b.score - a.score);

  const scores: Record<string, number> = { ...attempt.scores };
  scores.itemCount = ranked.length;
  scores.avgScore = ranked.length
    ? ranked.reduce((s, i) => s + i.score, 0) / ranked.length
    : 0;

  for (const f of fields) {
    const present = ranked.filter((i) => i.fields[f.name]).length;
    scores[`field:${f.name}`] = ranked.length ? present / ranked.length : 0;
  }

  return { items: ranked, scores };
}
