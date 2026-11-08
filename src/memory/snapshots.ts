import type { DatabaseSync } from "node:sqlite";
import type { SnapshotRecord } from "../types.js";

export function saveSnapshot(
  db: DatabaseSync,
  input: {
    site: string;
    target: string;
    url: string;
    items: Record<string, unknown>[];
  },
): SnapshotRecord {
  const createdAt = new Date().toISOString();
  const sample = input.items.slice(0, 20);
  const info = db
    .prepare(
      `INSERT INTO snapshots (site, target, url, item_count, sample_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.site,
      input.target,
      input.url,
      input.items.length,
      JSON.stringify(sample),
      createdAt,
    );

  return {
    id: Number(info.lastInsertRowid),
    site: input.site,
    target: input.target,
    url: input.url,
    itemCount: input.items.length,
    sampleJson: JSON.stringify(sample),
    createdAt,
  };
}

export function getLatestSnapshot(
  db: DatabaseSync,
  site: string,
  target: string,
): SnapshotRecord | null {
  const row = db
    .prepare(
      `SELECT id, site, target, url, item_count, sample_json, created_at
       FROM snapshots WHERE site = ? AND target = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(site, target) as
    | {
        id: number;
        site: string;
        target: string;
        url: string;
        item_count: number;
        sample_json: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    site: row.site,
    target: row.target,
    url: row.url,
    itemCount: row.item_count,
    sampleJson: row.sample_json,
    createdAt: row.created_at,
  };
}

export function recordRun(
  db: DatabaseSync,
  input: {
    site: string;
    target: string;
    ok: boolean;
    failureClass: string | null;
    source: string | null;
    itemCount: number;
    diagnostics: unknown[];
  },
): void {
  db.prepare(
    `INSERT INTO runs (site, target, ok, failure_class, source, item_count, diagnostics_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.site,
    input.target,
    input.ok ? 1 : 0,
    input.failureClass,
    input.source,
    input.itemCount,
    JSON.stringify(input.diagnostics),
    new Date().toISOString(),
  );
}
