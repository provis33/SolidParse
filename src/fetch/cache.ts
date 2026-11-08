import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FetchResponse } from "../types.js";

export function ensureCacheTable(db: DatabaseSync): void {
  db.exec(`
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
  `);
}

export interface CacheLookup {
  etag?: string;
  lastModified?: string;
  entry?: CachedEntry;
}

export interface CachedEntry {
  status: number;
  body: string;
  headers: Record<string, string>;
  finalUrl: string;
  bodyHash: string;
}

export function getCacheMeta(db: DatabaseSync, url: string): CacheLookup {
  const row = db
    .prepare(
      `SELECT status, etag, last_modified, body_hash, body, headers_json, final_url
       FROM fetch_cache WHERE url = ?`,
    )
    .get(url) as
    | {
        status: number;
        etag: string | null;
        last_modified: string | null;
        body_hash: string;
        body: string;
        headers_json: string;
        final_url: string;
      }
    | undefined;

  if (!row) return {};
  return {
    etag: row.etag ?? undefined,
    lastModified: row.last_modified ?? undefined,
    entry: {
      status: row.status,
      body: row.body,
      headers: JSON.parse(row.headers_json) as Record<string, string>,
      finalUrl: row.final_url,
      bodyHash: row.body_hash,
    },
  };
}

export function putCache(db: DatabaseSync, url: string, res: FetchResponse): string {
  const bodyHash = hashBody(res.body);
  db.prepare(
    `INSERT INTO fetch_cache (url, status, etag, last_modified, body_hash, body, headers_json, final_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       status=excluded.status,
       etag=excluded.etag,
       last_modified=excluded.last_modified,
       body_hash=excluded.body_hash,
       body=excluded.body,
       headers_json=excluded.headers_json,
       final_url=excluded.final_url,
       updated_at=excluded.updated_at`,
  ).run(
    url,
    res.status,
    res.headers.etag ?? res.headers.ETag ?? null,
    res.headers["last-modified"] ?? res.headers["Last-Modified"] ?? null,
    bodyHash,
    res.body,
    JSON.stringify(res.headers),
    res.finalUrl,
    new Date().toISOString(),
  );
  return bodyHash;
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function responseFromCache(url: string, entry: CachedEntry): FetchResponse {
  return {
    url,
    status: entry.status,
    headers: entry.headers,
    body: entry.body,
    finalUrl: entry.finalUrl,
    fromCache: true,
  };
}
