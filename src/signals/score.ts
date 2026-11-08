import type { ScoredValue } from "../types.js";

export function bestCandidate(candidates: ScoredValue[]): ScoredValue | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => b.score - a.score)[0] ?? null;
}

export function aggregateScore(fields: Record<string, ScoredValue | undefined>): number {
  const vals = Object.values(fields).filter(Boolean) as ScoredValue[];
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v.score, 0) / vals.length;
}

export function mergeReasons(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}
