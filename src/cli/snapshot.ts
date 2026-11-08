import { resolve } from "node:path";
import { loadConfigFromFile } from "../config/load.js";
import { openDb } from "../memory/db.js";
import { diffSnapshots } from "../memory/diff.js";
import { getLatestSnapshot } from "../memory/snapshots.js";

export function snapshotShow(configPath: string): void {
  const config = loadConfigFromFile(configPath);
  const stateDir = config.stateDir ?? resolve(process.cwd(), ".adaparse", config.site);
  const db = openDb(stateDir);
  const snap = getLatestSnapshot(db, config.site, config.target.preset);
  if (!snap) {
    console.log(JSON.stringify({ ok: false, message: "No snapshot found" }, null, 2));
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: snap.id,
        url: snap.url,
        itemCount: snap.itemCount,
        createdAt: snap.createdAt,
        sample: JSON.parse(snap.sampleJson),
      },
      null,
      2,
    ),
  );
}

export function snapshotDiff(configPath: string): void {
  const config = loadConfigFromFile(configPath);
  const stateDir = config.stateDir ?? resolve(process.cwd(), ".adaparse", config.site);
  const db = openDb(stateDir);
  const rows = db
    .prepare(
      `SELECT id, item_count, sample_json, created_at FROM snapshots
       WHERE site = ? AND target = ? ORDER BY id DESC LIMIT 2`,
    )
    .all(config.site, config.target.preset) as Array<{
    id: number;
    item_count: number;
    sample_json: string;
    created_at: string;
  }>;

  if (rows.length < 2) {
    console.log(
      JSON.stringify(
        { ok: false, message: "Need at least 2 snapshots to diff", found: rows.length },
        null,
        2,
      ),
    );
    return;
  }

  const [newer, older] = rows;
  const olderItems = JSON.parse(older!.sample_json) as Record<string, unknown>[];
  const newerItems = JSON.parse(newer!.sample_json) as Record<string, unknown>[];
  const fieldDiff = diffSnapshots(olderItems, newerItems);

  console.log(
    JSON.stringify(
      {
        ok: true,
        older: { id: older!.id, itemCount: older!.item_count, createdAt: older!.created_at },
        newer: { id: newer!.id, itemCount: newer!.item_count, createdAt: newer!.created_at },
        deltaCount: fieldDiff.countDelta,
        added: fieldDiff.added.length,
        removed: fieldDiff.removed.length,
        changedFields: fieldDiff.changed.slice(0, 50),
        sampleAdded: fieldDiff.added.slice(0, 5),
        sampleRemoved: fieldDiff.removed.slice(0, 5),
      },
      null,
      2,
    ),
  );
}
