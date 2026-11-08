import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { entriesOf } from "../config/load.js";
import { createFetcher } from "../fetch/create.js";
import { classifyFailure, looksSoft404 } from "../heal/classify.js";
import { layoutFingerprint, classifyLayoutChange } from "../heal/layout.js";
import {
  baselineFromPlain,
  runHeal,
  type HealOutcome,
} from "../heal/orchestrate.js";
import { validateCanary } from "../heal/canary.js";
import { dedupeItems } from "../match/dedup.js";
import { itemsToPlain } from "../match/filter.js";
import { scoreAndFilter } from "../match/scorer.js";
import { openDb, openMemoryDb } from "../memory/db.js";
import { buildGenomeFromItems, getLatestRule, saveRuleVersion } from "../memory/rules.js";
import { getLatestSnapshot, recordRun, saveSnapshot } from "../memory/snapshots.js";
import { notifyRunComplete } from "../notify/stub.js";
import { walkPagination } from "../pagination/walker.js";
import { extractFromHtmlAsync } from "../sources/index.js";
import type {
  AdaparseConfig,
  Diagnostic,
  ExtractAttempt,
  Fetcher,
  ItemCandidate,
  RunResult,
} from "../types.js";

export interface RunOptions {
  config: AdaparseConfig;
  doctor?: boolean;
  forceHeal?: boolean;
  fetcher?: Fetcher;
  db?: DatabaseSync;
  stateDir?: string;
  log?: (msg: string) => void;
}

export async function runJob(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const result = await runJobCore(opts, log);
  const notifyDiag = await notifyRunComplete(opts.config.notify, result, log);
  if (notifyDiag.length) {
    result.meta.diagnostics.push(...notifyDiag);
  }
  return result;
}

async function runJobCore(
  opts: RunOptions,
  log: (msg: string) => void,
): Promise<RunResult> {
  const config = ensureConfigDefaults(opts.config);
  const diagnostics: Diagnostic[] = [];
  const entries = entriesOf(config);
  const entryUrl = entries[0]!;
  const startedAt = Date.now();

  const stateDir =
    opts.stateDir ??
    config.stateDir ??
    resolve(process.cwd(), ".adaparse", config.site);

  const db = opts.db ?? (opts.doctor ? openMemoryDb() : openDb(stateDir));
  const policy = opts.fetcher
    ? null
    : createFetcher({ config, db });
  const fetcher: Fetcher = opts.fetcher ?? policy!;

  log(
    `adaparse: site=${config.site} target=${config.target.preset} entries=${entries.length} primary=${entryUrl}`,
  );

  let response;
  try {
    response = await fetcher.fetch(entryUrl, {
      timeoutMs: config.budgets.requestTimeoutMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failQuick(config, db, opts.doctor, entryUrl, "fetch_blocked", [
      { level: "error", code: "fetch_error", message },
    ]);
  }

  if (policy) diagnostics.push(...policy.diagnostics);

  diagnostics.push({
    level: "info",
    code: "fetched",
    message: `HTTP ${response.status} (${response.body.length} bytes)` +
      (response.fromCache ? " [cache]" : ""),
  });

  if (response.headers["x-adaparse-robots"] === "blocked") {
    return failQuick(config, db, opts.doctor, entryUrl, "robots_blocked", [
      ...diagnostics,
      { level: "error", code: "robots_blocked", message: "Blocked by robots.txt" },
    ]);
  }

  if (response.status === 403 || response.status === 429) {
    return failQuick(config, db, opts.doctor, entryUrl, "fetch_blocked", diagnostics);
  }

  const soft404 = response.status === 404 || looksSoft404(response.body);
  const latestRule = getLatestRule(db, config.site, config.target.preset);
  const latestSnap = getLatestSnapshot(db, config.site, config.target.preset);
  const baseline = latestSnap
    ? baselineFromPlain(JSON.parse(latestSnap.sampleJson) as Record<string, unknown>[])
    : null;

  if (latestRule?.genome.layoutFingerprint) {
    const fresh = layoutFingerprint(response.body);
    if (fresh.hash !== latestRule.genome.layoutFingerprint) {
      const change = classifyLayoutChange(
        { hash: latestRule.genome.layoutFingerprint, tagSeq: fresh.tagSeq, depthHist: fresh.depthHist },
        response.body,
      );
      diagnostics.push({
        level: "info",
        code: "layout_change",
        message: `Layout fingerprint changed (${change.kind})`,
        details: {
          prev: latestRule.genome.layoutFingerprint,
          next: fresh.hash,
          distance: change.distance,
        },
      });
    }
  }

  // Primary entry + extras + optional pagination / основная и доп. точки входа
  let pages: Array<{ url: string; html: string; networkJson?: unknown[] }> = [
    {
      url: response.finalUrl || entryUrl,
      html: response.body,
      networkJson: response.networkJson,
    },
  ];

  for (const extra of entries.slice(1)) {
    try {
      const extraRes = await fetcher.fetch(extra, {
        timeoutMs: config.budgets.requestTimeoutMs,
      });
      if (extraRes.status === 200 && extraRes.headers["x-adaparse-robots"] !== "blocked") {
        pages.push({
          url: extraRes.finalUrl || extra,
          html: extraRes.body,
          networkJson: extraRes.networkJson,
        });
        diagnostics.push({
          level: "info",
          code: "multi_entry",
          message: `Fetched extra entry ${extra}`,
        });
      }
    } catch (err) {
      diagnostics.push({
        level: "warn",
        code: "multi_entry_error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (config.pagination.enabled && !soft404) {
    const walked = await walkPagination({
      fetcher,
      startUrl: response.finalUrl || entryUrl,
      startHtml: response.body,
      maxPages: config.pagination.maxPages,
      timeoutMs: config.budgets.requestTimeoutMs,
    });
    diagnostics.push(...walked.diagnostics);
    // Sniffed JSON stays on page 1 only / sniff JSON только у первой страницы
    const rest = walked.pages.slice(1).map((p) => ({ ...p, networkJson: undefined as unknown[] | undefined }));
    pages = [{ ...pages[0]!, url: walked.pages[0]?.url ?? pages[0]!.url, html: walked.pages[0]?.html ?? pages[0]!.html }, ...rest, ...pages.slice(1)];
  }

  let merged: ItemCandidate[] = [];
  let bestAttempt: ExtractAttempt | null = null;
  for (const page of pages) {
    const attempt = await extractFromHtmlAsync(
      page.html,
      page.url,
      config.target.preset,
      config.target.fields,
      fetcher,
      page.networkJson,
    );
    diagnostics.push(...attempt.diagnostics);
    const { items } = scoreAndFilter(attempt, config.target.fields);
    merged.push(...items);
    if (!bestAttempt || attempt.items.length > bestAttempt.items.length) {
      bestAttempt = attempt;
    }
  }

  merged = dedupeItems(merged);
  let { items, scores } = scoreAndFilter(
    {
      source: bestAttempt?.source ?? "html_signals",
      items: merged,
      diagnostics: [],
      scores: {},
    },
    config.target.fields,
  );

  let canary = validateCanary(items, config.target.fields, config.heal.canary, baseline);
  diagnostics.push(...canary.diagnostics);

  let needHeal = Boolean(opts.forceHeal) || soft404;
  if (!items.length || !canary.ok || soft404) {
    needHeal = true;
    if (!items.length) {
      diagnostics.push(...classifyFailure({ response, items }).diagnostics);
    }
  }

  if (!needHeal && canary.ok && items.length) {
    return await acceptSuccess({
      config,
      db,
      doctor: opts.doctor,
      items,
      scores,
      diagnostics,
      source: bestAttempt?.source ?? "html_signals",
      entryUrl,
      html: response.body,
      latestRuleVersion: latestRule?.version ?? null,
      pagesFetched: pages.length,
      healed: false,
      discoveredUrl: null,
      durationMs: Date.now() - startedAt,
    });
  }

  if (opts.doctor && !opts.forceHeal) {
    const classified = classifyFailure({ response, items });
    return {
      ok: false,
      target: config.target.preset,
      items: itemsToPlain(items),
      meta: {
        source: bestAttempt?.source ?? null,
        ruleVersion: latestRule?.version ?? null,
        scores,
        diagnostics: [...diagnostics, ...classified.diagnostics],
        healed: false,
        failureClass: classified.failureClass,
        entryUrl,
        discoveredUrl: null,
        pagesFetched: pages.length,
      },
    };
  }

  log("adaparse: extract weak/failed — starting self-heal");

  const heal: HealOutcome = await runHeal({
    config,
    fetcher,
    html: response.body,
    url: response.finalUrl || entryUrl,
    genome: latestRule?.genome ?? null,
    baseline,
    persist: !opts.doctor,
  });
  diagnostics.push(...heal.diagnostics);

  if (heal.ok) {
    // Holdout canary before accepting heal / проверка на другой URL перед сохранением
    if (config.heal.holdoutPages > 0 && !opts.doctor) {
      const holdoutUrl =
        heal.discoveredUrl ||
        latestRule?.genome.entrypoints.find((u) => u !== entryUrl) ||
        null;
      if (holdoutUrl && holdoutUrl !== (response.finalUrl || entryUrl)) {
        try {
          const holdRes = await fetcher.fetch(holdoutUrl, {
            timeoutMs: config.budgets.requestTimeoutMs,
          });
          if (holdRes.status === 200) {
            const holdAttempt = await extractFromHtmlAsync(
              holdRes.body,
              holdRes.finalUrl || holdoutUrl,
              config.target.preset,
              config.target.fields,
              fetcher,
              holdRes.networkJson,
            );
            const holdScored = scoreAndFilter(holdAttempt, config.target.fields);
            const holdCanary = validateCanary(
              holdScored.items,
              config.target.fields,
              config.heal.canary,
              baselineFromPlain(heal.plain),
            );
            diagnostics.push({
              level: "info",
              code: "holdout_canary",
              message: `Holdout ${holdoutUrl}: ok=${holdCanary.ok}`,
            });
            diagnostics.push(...holdCanary.diagnostics);
            if (!holdCanary.ok) {
              const failed: RunResult = {
                ok: false,
                target: config.target.preset,
                items: heal.plain,
                meta: {
                  source: heal.source,
                  ruleVersion: latestRule?.version ?? null,
                  scores: heal.scores,
                  diagnostics: [
                    ...diagnostics,
                    {
                      level: "error",
                      code: "holdout_failed",
                      message: "Heal rejected: holdout canary failed",
                    },
                  ],
                  healed: false,
                  failureClass: "validation_failed",
                  entryUrl,
                  discoveredUrl: heal.discoveredUrl,
                  pagesFetched: pages.length,
                },
              };
              if (!opts.doctor) {
                recordRunMetrics(db, {
                  site: config.site,
                  target: config.target.preset,
                  ok: false,
                  itemCount: failed.items.length,
                  pagesFetched: pages.length,
                  healed: false,
                  source: failed.meta.source,
                  durationMs: Date.now() - startedAt,
                });
              }
              return failed;
            }
          }
        } catch (err) {
          diagnostics.push({
            level: "warn",
            code: "holdout_error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return await acceptSuccess({
      config,
      db,
      doctor: opts.doctor,
      items: heal.items,
      scores: heal.scores,
      diagnostics,
      source: heal.source ?? "healed_rule",
      entryUrl,
      html: response.body,
      latestRuleVersion: latestRule?.version ?? null,
      pagesFetched: pages.length,
      healed: true,
      discoveredUrl: heal.discoveredUrl,
      forceNewRule: true,
      entryOverride: heal.discoveredUrl ?? entryUrl,
      durationMs: Date.now() - startedAt,
    });
  }

  const result: RunResult = {
    ok: false,
    target: config.target.preset,
    items: heal.plain.length ? heal.plain : itemsToPlain(items),
    meta: {
      source: heal.source,
      ruleVersion: latestRule?.version ?? null,
      scores: { ...scores, ...heal.scores },
      diagnostics,
      healed: false,
      failureClass: heal.failureClass,
      entryUrl,
      discoveredUrl: heal.discoveredUrl,
      pagesFetched: pages.length,
    },
  };

  if (!opts.doctor) {
    recordRun(db, {
      site: config.site,
      target: config.target.preset,
      ok: false,
      failureClass: result.meta.failureClass,
      source: result.meta.source,
      itemCount: result.items.length,
      diagnostics,
    });
    recordRunMetrics(db, {
      site: config.site,
      target: config.target.preset,
      ok: false,
      itemCount: result.items.length,
      pagesFetched: pages.length,
      healed: false,
      source: result.meta.source,
      durationMs: Date.now() - startedAt,
    });
  }

  return result;
}

async function acceptSuccess(input: {
  config: AdaparseConfig;
  db: DatabaseSync;
  doctor?: boolean;
  items: ItemCandidate[];
  scores: Record<string, number>;
  diagnostics: Diagnostic[];
  source: RunResult["meta"]["source"];
  entryUrl: string;
  html: string;
  latestRuleVersion: number | null;
  pagesFetched: number;
  healed: boolean;
  discoveredUrl: string | null;
  forceNewRule?: boolean;
  entryOverride?: string;
  durationMs?: number;
}): Promise<RunResult> {
  const plain = itemsToPlain(input.items);
  let ruleVersion = input.latestRuleVersion;

  if (!input.doctor) {
    const genome = buildGenomeFromItems(
      input.items,
      input.entryOverride ?? input.entryUrl,
      [input.source ?? "html_signals", "jsonld", "microdata", "embedded", "network"],
    );
    genome.layoutFingerprint = layoutFingerprint(input.html).hash;
    if (input.discoveredUrl) {
      genome.entrypoints = [input.discoveredUrl, ...genome.entrypoints];
    }
    if (input.forceNewRule || input.latestRuleVersion == null) {
      const saved = saveRuleVersion(
        input.db,
        input.config.site,
        input.config.target.preset,
        genome,
      );
      ruleVersion = saved.version;
    }
    saveSnapshot(input.db, {
      site: input.config.site,
      target: input.config.target.preset,
      url: input.entryOverride ?? input.entryUrl,
      items: plain,
    });
    recordRun(input.db, {
      site: input.config.site,
      target: input.config.target.preset,
      ok: true,
      failureClass: null,
      source: input.source,
      itemCount: plain.length,
      diagnostics: input.diagnostics,
    });
    recordRunMetrics(input.db, {
      site: input.config.site,
      target: input.config.target.preset,
      ok: true,
      itemCount: plain.length,
      pagesFetched: input.pagesFetched,
      healed: input.healed,
      source: input.source,
      durationMs: input.durationMs ?? 0,
    });
  }

  return {
    ok: true,
    target: input.config.target.preset,
    items: plain,
    meta: {
      source: input.source,
      ruleVersion,
      scores: input.scores,
      diagnostics: input.diagnostics,
      healed: input.healed,
      failureClass: null,
      entryUrl: input.entryUrl,
      discoveredUrl: input.discoveredUrl,
      pagesFetched: input.pagesFetched,
    },
  };
}

function failQuick(
  config: AdaparseConfig,
  db: DatabaseSync,
  doctor: boolean | undefined,
  entryUrl: string,
  failureClass: RunResult["meta"]["failureClass"],
  diagnostics: Diagnostic[],
): RunResult {
  const result: RunResult = {
    ok: false,
    target: config.target.preset,
    items: [],
    meta: {
      source: null,
      ruleVersion: null,
      scores: {},
      diagnostics,
      healed: false,
      failureClass,
      entryUrl,
      discoveredUrl: null,
      pagesFetched: 0,
    },
  };
  if (!doctor) {
    recordRun(db, {
      site: config.site,
      target: config.target.preset,
      ok: false,
      failureClass,
      source: null,
      itemCount: 0,
      diagnostics,
    });
    recordRunMetrics(db, {
      site: config.site,
      target: config.target.preset,
      ok: false,
      itemCount: 0,
      pagesFetched: 0,
      healed: false,
      source: null,
      durationMs: 0,
    });
  }
  return result;
}

/** Defaults for programmatic configs that omit nested blocks. / Дефолты для вызовов из кода. */
export function ensureConfigDefaults(config: AdaparseConfig): AdaparseConfig {
  return {
    ...config,
    fetch: {
      mode: config.fetch?.mode ?? "http",
      respectRobots: config.fetch?.respectRobots ?? true,
      cache: config.fetch?.cache ?? true,
      browser: config.fetch?.browser ?? {
        waitUntil: "domcontentloaded",
        maxScrolls: 0,
        loadMoreSelectors: [],
        captureNetworkJson: true,
      },
    },
    pagination: config.pagination ?? {
      enabled: ["product_list", "article_list", "custom"].includes(config.target.preset),
      maxPages: 10,
    },
    session: config.session ?? { headers: {} },
    plugins: config.plugins ?? {
      llm: {
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        model: "gpt-4o-mini",
        useFor: ["heal_hints"],
      },
    },
    heal: {
      enabled: config.heal?.enabled ?? true,
      discovery: config.heal?.discovery ?? true,
      canary: config.heal?.canary ?? "balanced",
      holdoutPages: config.heal?.holdoutPages ?? 0,
    },
  };
}

export function recordRunMetrics(
  db: DatabaseSync,
  input: {
    site: string;
    target: string;
    ok: boolean;
    itemCount: number;
    pagesFetched: number;
    healed: boolean;
    source: string | null;
    durationMs: number;
  },
): void {
  db.prepare(
    `INSERT INTO run_metrics (site, target, ok, item_count, pages_fetched, healed, source, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.site,
    input.target,
    input.ok ? 1 : 0,
    input.itemCount,
    input.pagesFetched,
    input.healed ? 1 : 0,
    input.source,
    input.durationMs,
    new Date().toISOString(),
  );
}

export function summarizeMetrics(
  db: DatabaseSync,
  site?: string,
): {
  runs: number;
  okRate: number;
  avgItems: number;
  avgDurationMs: number;
  healRate: number;
  bySource: Record<string, number>;
} {
  const rows = (
    site
      ? db.prepare(`SELECT * FROM run_metrics WHERE site = ? ORDER BY id DESC LIMIT 200`).all(site)
      : db.prepare(`SELECT * FROM run_metrics ORDER BY id DESC LIMIT 200`).all()
  ) as Array<{
    ok: number;
    item_count: number;
    healed: number;
    source: string | null;
    duration_ms: number;
  }>;

  if (!rows.length) {
    return { runs: 0, okRate: 0, avgItems: 0, avgDurationMs: 0, healRate: 0, bySource: {} };
  }
  const ok = rows.filter((r) => r.ok).length;
  const healed = rows.filter((r) => r.healed).length;
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const s = r.source ?? "null";
    bySource[s] = (bySource[s] ?? 0) + 1;
  }
  return {
    runs: rows.length,
    okRate: ok / rows.length,
    avgItems: rows.reduce((s, r) => s + r.item_count, 0) / rows.length,
    avgDurationMs: rows.reduce((s, r) => s + r.duration_ms, 0) / rows.length,
    healRate: healed / rows.length,
    bySource,
  };
}
