import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { normalizeConfig } from "../config/load.js";
import { openMemoryDb } from "../memory/db.js";
import { runJob } from "../runner/orchestrator.js";
import type { AdaparseConfig, Fetcher, FetchResponse } from "../types.js";

export interface EvalCase {
  id: string;
  dir: string;
  expected: Record<string, unknown>[];
  config: AdaparseConfig;
  htmlMap: Record<string, string>;
  networkJson?: unknown[];
}

export interface FieldScore {
  field: string;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

export interface CaseResult {
  id: string;
  ok: boolean;
  itemCount: number;
  expectedCount: number;
  fields: FieldScore[];
  microF1: number;
}

export interface EvalScoreboard {
  cases: number;
  passedCases: number;
  failedCases: number;
  microF1: number;
  results: CaseResult[];
}

export async function runEvalCorpus(dir: string): Promise<EvalScoreboard> {
  const abs = resolve(dir);
  const cases = loadEvalCases(abs);
  const results: CaseResult[] = [];

  for (const c of cases) {
    const fetcher = new MapFetcher(c.htmlMap, c.networkJson);
    const db = openMemoryDb();
    const result = await runJob({
      config: c.config,
      fetcher,
      db,
      doctor: true,
      log: () => {},
    });
    results.push(scoreCase(c.id, c.expected, result.items));
  }

  const passedCases = results.filter((r) => r.ok).length;
  const microF1 =
    results.length === 0
      ? 0
      : results.reduce((s, r) => s + r.microF1, 0) / results.length;

  return {
    cases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    microF1,
    results,
  };
}

export function loadEvalCases(root: string): EvalCase[] {
  const entries = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  const cases: EvalCase[] = [];

  for (const ent of entries) {
    const dir = join(root, ent.name);
    const expectedPath = join(dir, "expected.json");
    const configYaml = join(dir, "config.yaml");
    const configJson = join(dir, "config.json");
    if (!existsSync(expectedPath)) continue;
    if (!existsSync(configYaml) && !existsSync(configJson)) continue;

    const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<
      string,
      unknown
    >[];

    const rawText = existsSync(configYaml)
      ? readFileSync(configYaml, "utf8")
      : readFileSync(configJson, "utf8");
    const parsedRaw = existsSync(configYaml) ? parseYaml(rawText) : JSON.parse(rawText);

    const htmlMap: Record<string, string> = {};
    let networkJson: unknown[] | undefined;
    const networkPath = join(dir, "network.json");
    if (existsSync(networkPath)) {
      networkJson = JSON.parse(readFileSync(networkPath, "utf8")) as unknown[];
    }

    const singleHtml = join(dir, "page.html");
    if (existsSync(singleHtml)) {
      htmlMap["eval://page"] = readFileSync(singleHtml, "utf8");
    }
    const urlMapPath = join(dir, "url-map.json");
    if (existsSync(urlMapPath)) {
      const map = JSON.parse(readFileSync(urlMapPath, "utf8")) as Record<string, string>;
      for (const [url, rel] of Object.entries(map)) {
        htmlMap[url] = readFileSync(resolve(dir, rel), "utf8");
      }
    }

    const config = normalizeConfig(parsedRaw);
    config.fixtures = { ...htmlMap, ...(config.fixtures ?? {}) };
    if (existsSync(urlMapPath)) {
      const urls = Object.keys(
        JSON.parse(readFileSync(urlMapPath, "utf8")) as Record<string, string>,
      );
      if (urls.length === 1) config.entry = urls[0]!;
      else if (urls.length > 1) config.entry = urls;
    } else if (existsSync(singleHtml)) {
      config.entry = "eval://page";
    }

    // Offline eval: no discovery crawl / офлайн-оценка без discovery
    config.heal = { ...config.heal, discovery: false };
    config.pagination = { ...config.pagination, enabled: false };

    cases.push({ id: ent.name, dir, expected, config, htmlMap, networkJson });
  }

  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

export function scoreCase(
  id: string,
  expected: Record<string, unknown>[],
  actual: Record<string, unknown>[],
): CaseResult {
  // Score expected fields only / считаем только поля из expected.json
  const fields = collectExpectedFields(expected);
  const fieldScores = fields.map((field) => scoreField(field, expected, actual));
  const microF1 =
    fieldScores.length === 0
      ? 0
      : fieldScores.reduce((s, f) => s + f.f1, 0) / fieldScores.length;
  const ok = microF1 >= 0.7 && actual.length > 0;
  return {
    id,
    ok,
    itemCount: actual.length,
    expectedCount: expected.length,
    fields: fieldScores,
    microF1,
  };
}

function collectExpectedFields(expected: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const row of expected) {
    for (const k of Object.keys(row)) set.add(k);
  }
  return [...set].sort();
}

function scoreField(
  field: string,
  expected: Record<string, unknown>[],
  actual: Record<string, unknown>[],
): FieldScore {
  const expVals = new Set(
    expected.map((r) => normalizeVal(r[field])).filter((v): v is string => v !== null),
  );
  const actVals = new Set(
    actual.map((r) => normalizeVal(r[field])).filter((v): v is string => v !== null),
  );
  let tp = 0;
  for (const v of actVals) if (expVals.has(v)) tp++;
  const fp = [...actVals].filter((v) => !expVals.has(v)).length;
  const fn = [...expVals].filter((v) => !actVals.has(v)).length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { field, precision, recall, f1, tp, fp, fn };
}

function normalizeVal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim().toLowerCase();
}

class MapFetcher implements Fetcher {
  constructor(
    private map: Record<string, string>,
    private networkJson?: unknown[],
  ) {}
  async fetch(url: string): Promise<FetchResponse> {
    const body = this.map[url];
    if (body == null) {
      return { url, status: 404, headers: {}, body: "", finalUrl: url };
    }
    return {
      url,
      status: 200,
      headers: { "content-type": "text/html" },
      body,
      finalUrl: url,
      networkJson: this.networkJson,
    };
  }
}
