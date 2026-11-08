export type {
  AdaparseConfig,
  Diagnostic,
  FailureClass,
  Fetcher,
  FieldConfig,
  NotifyConfig,
  RunResult,
  RuleGenome,
  TargetPreset,
} from "./types.js";

export { loadConfigFromFile, normalizeConfig, entriesOf } from "./config/load.js";
export { AdaparseConfigSchema } from "./config/schema.js";
export { PRESETS, resolveFields } from "./config/presets.js";
export { HttpFetcher } from "./fetch/http.js";
export { FixtureFetcher, CompositeFetcher } from "./fetch/fixture.js";
export { BrowserFetcher } from "./fetch/browser.js";
export { createFetcher } from "./fetch/create.js";
export { parseRobots, isAllowed, clearRobotsCache } from "./fetch/robots.js";
export { extractFromHtml, extractFromHtmlAsync } from "./sources/index.js";
export { runJob, ensureConfigDefaults } from "./runner/orchestrator.js";
export { validateCanary, baselineFromPlain } from "./heal/canary.js";
export { layoutFingerprint, layoutDistance } from "./heal/layout.js";
export { openDb, openMemoryDb } from "./memory/db.js";
export {
  getLatestRule,
  listRuleVersions,
  exportRulePack,
  importRulePack,
} from "./memory/rules.js";
export { diffSnapshots } from "./memory/diff.js";
export { notifyRunComplete } from "./notify/stub.js";
export { deliverWebhook, signPayload } from "./notify/webhook.js";
export { dedupeItems } from "./match/dedup.js";
export { walkPagination, findNextUrl } from "./pagination/walker.js";
export { resolveSession, parseCookieFile } from "./fetch/session.js";
export { extractFromNetworkJson } from "./sources/network.js";
export { requestHealHints, parseHints } from "./plugins/llm.js";
export { runEvalCorpus, scoreCase } from "./eval/runner.js";
export { recordRunMetrics, summarizeMetrics } from "./runner/orchestrator.js";

import { normalizeConfig } from "./config/load.js";
import { ensureConfigDefaults, runJob } from "./runner/orchestrator.js";
import type { AdaparseConfig, RunResult } from "./types.js";

/** Library entry: same semantics as CLI `run`. / Точка входа из кода, как CLI run. */
export async function run(
  config: AdaparseConfig | Record<string, unknown>,
  opts?: { doctor?: boolean; forceHeal?: boolean },
): Promise<RunResult> {
  const normalized =
    "budgets" in config &&
    config.budgets &&
    typeof config.budgets === "object" &&
    "maxPages" in (config.budgets as object)
      ? ensureConfigDefaults(config as AdaparseConfig)
      : normalizeConfig(config);
  return runJob({
    config: normalized,
    doctor: opts?.doctor,
    forceHeal: opts?.forceHeal,
  });
}
