export interface SnapshotFieldDiff {
  added: Array<{ identity: string; item: Record<string, unknown> }>;
  removed: Array<{ identity: string; item: Record<string, unknown> }>;
  changed: Array<{
    identity: string;
    field: string;
    before: unknown;
    after: unknown;
  }>;
  countDelta: number;
}

function identityOf(item: Record<string, unknown>): string {
  if (typeof item.url === "string") return `url:${item.url}`;
  if (typeof item.sku === "string") return `sku:${item.sku}`;
  return `row:${JSON.stringify(item)}`;
}

export function diffSnapshots(
  older: Record<string, unknown>[],
  newer: Record<string, unknown>[],
): SnapshotFieldDiff {
  const oldMap = new Map(older.map((i) => [identityOf(i), i]));
  const newMap = new Map(newer.map((i) => [identityOf(i), i]));

  const added: SnapshotFieldDiff["added"] = [];
  const removed: SnapshotFieldDiff["removed"] = [];
  const changed: SnapshotFieldDiff["changed"] = [];

  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) added.push({ identity: id, item });
  }
  for (const [id, item] of oldMap) {
    if (!newMap.has(id)) removed.push({ identity: id, item });
  }
  for (const [id, neu] of newMap) {
    const old = oldMap.get(id);
    if (!old) continue;
    const keys = new Set([...Object.keys(old), ...Object.keys(neu)]);
    for (const k of keys) {
      if (JSON.stringify(old[k]) !== JSON.stringify(neu[k])) {
        changed.push({ identity: id, field: k, before: old[k], after: neu[k] });
      }
    }
  }

  return {
    added,
    removed,
    changed,
    countDelta: newer.length - older.length,
  };
}
