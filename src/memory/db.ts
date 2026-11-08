import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(stateDir: string): DatabaseSync {
  mkdirSync(stateDir, { recursive: true });
  const path = resolve(stateDir, "adaparse.sqlite");
  const db = new DatabaseSync(path);
  migrate(db);
  return db;
}

export function openMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      target TEXT NOT NULL,
      version INTEGER NOT NULL,
      genome_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(site, target, version)
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      target TEXT NOT NULL,
      url TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      sample_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      target TEXT NOT NULL,
      ok INTEGER NOT NULL,
      failure_class TEXT,
      source TEXT,
      item_count INTEGER NOT NULL,
      diagnostics_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fetch_cache (
      url TEXT PRIMARY KEY,
      status INTEGER NOT NULL,
      etag TEXT,
      last_modified TEXT,
      body_hash TEXT NOT NULL,
      body TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      final_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watch_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      target TEXT NOT NULL,
      ok INTEGER NOT NULL,
      item_count INTEGER NOT NULL,
      drift INTEGER NOT NULL,
      healed INTEGER NOT NULL,
      failure_class TEXT,
      diff_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS run_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      target TEXT NOT NULL,
      ok INTEGER NOT NULL,
      item_count INTEGER NOT NULL,
      pages_fetched INTEGER NOT NULL,
      healed INTEGER NOT NULL,
      source TEXT,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
