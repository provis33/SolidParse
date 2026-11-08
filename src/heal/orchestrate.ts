import { discoverPages } from "../discovery/bfs.js";
import { scoreAndFilter } from "../match/scorer.js";
import { itemsToPlain } from "../match/filter.js";
import { requestHealHints } from "../plugins/llm.js";
import type {
  AdaparseConfig,
  Diagnostic,
  ExtractAttempt,
  Fetcher,
  ItemCandidate,
  RuleGenome,
  RunResult,
} from "../types.js";
import { baselineFromPlain, validateCanary, type CanaryBaseline } from "./canary.js";
import { classifyFailure } from "./classify.js";
import {
  strategyAnchors,
  strategyFingerprint,
  strategyRedeetect,
} from "./strategies.js";

export interface HealContext {
  config: AdaparseConfig;
  fetcher: Fetcher;
  html: string;
  url: string;
  genome: RuleGenome | null;
  baseline: CanaryBaseline | null;
  persist: boolean;
}

export interface HealOutcome {
  ok: boolean;
  items: ItemCandidate[];
  plain: Record<string, unknown>[];
  source: RunResult["meta"]["source"];
  diagnostics: Diagnostic[];
  healed: boolean;
  failureClass: RunResult["meta"]["failureClass"];
  scores: Record<string, number>;
  discoveredUrl: string | null;
  attempt: ExtractAttempt | null;
}

export async function runHeal(ctx: HealContext): Promise<HealOutcome> {
  const diagnostics: Diagnostic[] = [];
  const { config } = ctx;
  const fields = config.target.fields;
  const preset = config.target.preset;

  if (!config.heal.enabled) {
    const classified = classifyFailure({ items: [] });
    return {
      ok: false,
      items: [],
      plain: [],
      source: null,
      diagnostics: [
        ...classified.diagnostics,
        { level: "info", code: "heal_disabled", message: "Heal disabled in config" },
      ],
      healed: false,
      failureClass: classified.failureClass,
      scores: {},
      discoveredUrl: null,
      attempt: null,
    };
  }

  const strategies = [];
  if (ctx.genome?.structuralFingerprints?.length) {
    strategies.push(() =>
      strategyFingerprint(ctx.html, ctx.url, preset, fields, ctx.genome!),
    );
  }
  strategies.push(() => strategyRedeetect(ctx.html, ctx.url, preset, fields));
  if (ctx.genome) {
    strategies.push(() => strategyAnchors(ctx.html, ctx.url, preset, fields, ctx.genome!));
  }

  for (const run of strategies) {
    const result = run();
    diagnostics.push(...result.diagnostics);
    const { items, scores } = scoreAndFilter(result.attempt, fields);
    const canary = validateCanary(items, fields, config.heal.canary, ctx.baseline);
    diagnostics.push(...canary.diagnostics);
    if (canary.ok) {
      return {
        ok: true,
        items,
        plain: itemsToPlain(items),
        source: "healed_rule",
        diagnostics: [
          ...diagnostics,
          {
            level: "info",
            code: "heal_accepted",
            message: `Heal strategy accepted: ${result.name}`,
          },
        ],
        healed: true,
        failureClass: null,
        scores,
        discoveredUrl: null,
        attempt: result.attempt,
      };
    }
    diagnostics.push({
      level: "warn",
      code: "heal_strategy_rejected",
      message: `Strategy ${result.name} failed canary`,
    });
  }

  // Last resort: limited discovery / крайний случай — ограниченный обход
  if (config.heal.discovery) {
    diagnostics.push({
      level: "info",
      code: "heal_discovery_start",
      message: "Starting limited discovery",
    });
    const discovery = await discoverPages({
      fetcher: ctx.fetcher,
      startUrl: ctx.url,
      preset,
      budgets: config.budgets,
    });
    diagnostics.push(...discovery.diagnostics);

    for (const hit of discovery.hits.slice(0, 5)) {
      const attempt = strategyRedeetect(hit.html, hit.url, preset, fields);
      const { items, scores } = scoreAndFilter(attempt.attempt, fields);
      const canary = validateCanary(items, fields, config.heal.canary, ctx.baseline);
      diagnostics.push(...canary.diagnostics);
      if (canary.ok) {
        return {
          ok: true,
          items,
          plain: itemsToPlain(items),
          source: "discovery",
          diagnostics: [
            ...diagnostics,
            {
              level: "info",
              code: "discovery_accepted",
              message: `Discovery found viable page: ${hit.url}`,
            },
          ],
          healed: true,
          failureClass: null,
          scores,
          discoveredUrl: hit.url,
          attempt: attempt.attempt,
        };
      }
    }

    const classified = classifyFailure({ items: [], discoveryExhausted: true });
    return {
      ok: false,
      items: [],
      plain: [],
      source: "discovery",
      diagnostics: [...diagnostics, ...classified.diagnostics],
      healed: false,
      failureClass: classified.failureClass,
      scores: {},
      discoveredUrl: null,
      attempt: null,
    };
  }

  // Optional LLM hints; still must pass canary / подсказки LLM только через canary
  const llmCfg = config.plugins?.llm;
  if (llmCfg?.enabled && llmCfg.useFor.includes("heal_hints")) {
    const llm = await requestHealHints({
      config: llmCfg,
      html: ctx.html,
      fields,
    });
    diagnostics.push(...llm.diagnostics);
    if (llm.hints.length) {
      const hintedGenome: RuleGenome = {
        sourcePreference: ctx.genome?.sourcePreference ?? ["html_signals", "jsonld"],
        structuralFingerprints: ctx.genome?.structuralFingerprints ?? [],
        fieldAnchors: llm.hints.map((h) => ({
          name: h.field,
          preferredSignals: h.signals,
          exampleValues: [],
          patterns: h.selectors ?? [],
          fingerprintHints: h.signals,
        })),
        urlPatterns: ctx.genome?.urlPatterns ?? [],
        signalPreferences: Object.fromEntries(
          llm.hints.flatMap((h) => h.signals.map((s) => [s, 1] as const)),
        ),
        entrypoints: ctx.genome?.entrypoints ?? [ctx.url],
      };
      const hinted = strategyAnchors(ctx.html, ctx.url, preset, fields, hintedGenome);
      diagnostics.push(...hinted.diagnostics);
      const scored = scoreAndFilter(hinted.attempt, fields);
      const canary = validateCanary(scored.items, fields, config.heal.canary, ctx.baseline);
      diagnostics.push(...canary.diagnostics);
      if (canary.ok) {
        return {
          ok: true,
          items: scored.items,
          plain: itemsToPlain(scored.items),
          source: "healed_rule",
          diagnostics: [
            ...diagnostics,
            {
              level: "info",
              code: "llm_hint_accepted",
              message: "Heal accepted after optional LLM field hints (canary passed)",
            },
          ],
          healed: true,
          failureClass: null,
          scores: scored.scores,
          discoveredUrl: null,
          attempt: hinted.attempt,
        };
      }
      diagnostics.push({
        level: "warn",
        code: "llm_hint_rejected",
        message: "LLM hints failed canary — ignored",
      });
    }
  }

  const classified = classifyFailure({ items: [], validationFailed: true });
  return {
    ok: false,
    items: [],
    plain: [],
    source: null,
    diagnostics: [...diagnostics, ...classified.diagnostics],
    healed: false,
    failureClass: "selector_drift",
    scores: {},
    discoveredUrl: null,
    attempt: null,
  };
}

export { baselineFromPlain };
