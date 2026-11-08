import type { DatabaseSync } from "node:sqlite";
import type { ItemCandidate, RuleGenome, StoredRule } from "../types.js";

export function getLatestRule(
  db: DatabaseSync,
  site: string,
  target: string,
): StoredRule | null {
  const row = db
    .prepare(
      `SELECT id, site, target, version, genome_json, created_at
       FROM rules WHERE site = ? AND target = ?
       ORDER BY version DESC LIMIT 1`,
    )
    .get(site, target) as
    | {
        id: number;
        site: string;
        target: string;
        version: number;
        genome_json: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    site: row.site,
    target: row.target,
    version: row.version,
    genome: JSON.parse(row.genome_json) as RuleGenome,
    createdAt: row.created_at,
  };
}

export function saveRuleVersion(
  db: DatabaseSync,
  site: string,
  target: string,
  genome: RuleGenome,
): StoredRule {
  const latest = getLatestRule(db, site, target);
  const version = (latest?.version ?? 0) + 1;
  const createdAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO rules (site, target, version, genome_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(site, target, version, JSON.stringify(genome), createdAt);

  return {
    id: Number(info.lastInsertRowid),
    site,
    target,
    version,
    genome,
    createdAt,
  };
}

export function buildGenomeFromItems(
  items: ItemCandidate[],
  entryUrl: string,
  sourcePreference: RuleGenome["sourcePreference"],
): RuleGenome {
  const fingerprints = items
    .map((i) => i.fingerprint)
    .filter((f): f is string => Boolean(f))
    .slice(0, 20);

  const fieldAnchors = collectAnchors(items);
  const signalPreferences: Record<string, number> = {};
  for (const item of items) {
    for (const f of Object.values(item.fields)) {
      for (const r of f.reasons) {
        signalPreferences[r] = (signalPreferences[r] ?? 0) + 1;
      }
    }
  }

  return {
    sourcePreference,
    structuralFingerprints: fingerprints,
    fieldAnchors,
    urlPatterns: deriveUrlPatterns(items),
    signalPreferences,
    entrypoints: [entryUrl],
  };
}

function collectAnchors(items: ItemCandidate[]): RuleGenome["fieldAnchors"] {
  const byField = new Map<string, string[]>();
  const reasonsByField = new Map<string, string[]>();

  for (const item of items.slice(0, 10)) {
    for (const [name, scored] of Object.entries(item.fields)) {
      const vals = byField.get(name) ?? [];
      vals.push(String(scored.value));
      byField.set(name, vals);
      const rs = reasonsByField.get(name) ?? [];
      reasonsByField.set(name, [...new Set([...rs, ...scored.reasons])]);
    }
  }

  return [...byField.entries()].map(([name, examples]) => ({
    name,
    preferredSignals: reasonsByField.get(name) ?? [],
    exampleValues: examples.slice(0, 5),
    patterns: examples.slice(0, 3).map(escapeLoose),
  }));
}

function deriveUrlPatterns(items: ItemCandidate[]): string[] {
  const urls = items
    .map((i) => i.fields.url?.value)
    .filter((u): u is string => typeof u === "string");
  const patterns = new Set<string>();
  for (const u of urls.slice(0, 10)) {
    try {
      const path = new URL(u).pathname;
      const parts = path.split("/").filter(Boolean);
      if (parts[0]) patterns.add(`/${parts[0]}/`);
    } catch {
      /* ignore */
    }
  }
  return [...patterns];
}

function escapeLoose(s: string): string {
  return s.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RulePack {
  site: string;
  target: string;
  version: number;
  genome: RuleGenome;
  sample?: Record<string, unknown>[];
  exportedAt: string;
}

export function exportRulePack(
  db: DatabaseSync,
  site: string,
  target: string,
): RulePack | null {
  const rule = getLatestRule(db, site, target);
  if (!rule) return null;
  const snap = db
    .prepare(
      `SELECT sample_json FROM snapshots WHERE site = ? AND target = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(site, target) as { sample_json: string } | undefined;
  return {
    site: rule.site,
    target: rule.target,
    version: rule.version,
    genome: rule.genome,
    sample: snap ? (JSON.parse(snap.sample_json) as Record<string, unknown>[]) : undefined,
    exportedAt: new Date().toISOString(),
  };
}

/** Import always bumps version; never silent overwrite. / Импорт всегда новая версия. */
export function importRulePack(db: DatabaseSync, pack: RulePack): StoredRule {
  return saveRuleVersion(db, pack.site, pack.target, pack.genome);
}

export function listRuleVersions(
  db: DatabaseSync,
  site: string,
  target: string,
): StoredRule[] {
  const rows = db
    .prepare(
      `SELECT id, site, target, version, genome_json, created_at
       FROM rules WHERE site = ? AND target = ?
       ORDER BY version ASC`,
    )
    .all(site, target) as Array<{
    id: number;
    site: string;
    target: string;
    version: number;
    genome_json: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    site: row.site,
    target: row.target,
    version: row.version,
    genome: JSON.parse(row.genome_json) as RuleGenome,
    createdAt: row.created_at,
  }));
}
