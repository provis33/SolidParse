import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AdaparseConfig, FieldConfig, TargetPreset } from "../types.js";
import { resolveFields } from "./presets.js";
import { AdaparseConfigSchema } from "./schema.js";

const LIST_PRESETS: TargetPreset[] = ["product_list", "article_list", "custom"];

export function loadConfigFromFile(path: string): AdaparseConfig {
  const abs = resolve(path);
  const rawText = readFileSync(abs, "utf8");
  const raw = path.endsWith(".json") ? JSON.parse(rawText) : parseYaml(rawText);
  return normalizeConfig(raw);
}

export function normalizeConfig(raw: unknown): AdaparseConfig {
  const parsed = AdaparseConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`invalid_target_config: ${msg}`);
  }

  const c = parsed.data;
  const rawFields = c.target.fields as FieldConfig[] | undefined;

  if (c.target.preset === "custom" && (!rawFields || rawFields.length === 0)) {
    throw new Error(
      "invalid_target_config: custom preset requires target.fields with at least one field",
    );
  }

  const fields = resolveFields(c.target.preset, rawFields);
  const paginationEnabled =
    c.pagination.enabled && LIST_PRESETS.includes(c.target.preset);

  return {
    site: c.site,
    entry: c.entry,
    target: {
      preset: c.target.preset,
      fields,
    },
    heal: {
      enabled: c.heal.enabled,
      discovery: c.heal.discovery,
      canary: c.heal.canary,
      holdoutPages: c.heal.holdout_pages,
    },
    budgets: {
      maxPages: c.budgets.max_pages,
      maxDepth: c.budgets.max_depth,
      concurrency: c.budgets.concurrency,
      requestTimeoutMs: c.budgets.request_timeout_ms,
      timeBudgetMs: c.budgets.time_budget_ms,
    },
    output: {
      format: c.output.format,
      path: c.output.path,
    },
    fetch: {
      mode: c.fetch.mode,
      respectRobots: c.fetch.respect_robots,
      cache: c.fetch.cache,
      browser: {
        waitUntil: c.fetch.browser.wait_until,
        waitFor: c.fetch.browser.wait_for,
        maxScrolls: c.fetch.browser.max_scrolls,
        loadMoreSelectors: c.fetch.browser.load_more_selectors,
        captureNetworkJson: c.fetch.browser.capture_network_json,
      },
    },
    pagination: {
      enabled: paginationEnabled,
      maxPages: c.pagination.max_pages,
    },
    session: {
      cookiesFile: c.session.cookies_file,
      storageState: c.session.storage_state,
      headers: c.session.headers ?? {},
    },
    plugins: {
      llm: {
        enabled: c.plugins.llm.enabled,
        baseUrl: c.plugins.llm.base_url,
        apiKeyEnv: c.plugins.llm.api_key_env,
        model: c.plugins.llm.model,
        useFor: c.plugins.llm.use_for,
      },
    },
    notify: {
      enabled: c.notify.enabled,
      webhookUrl: c.notify.webhook_url,
      hmacSecret: c.notify.hmac_secret,
    },
    fixtures: c.fixtures,
    stateDir: c.state_dir,
  };
}

export function entriesOf(config: AdaparseConfig): string[] {
  return Array.isArray(config.entry) ? config.entry : [config.entry];
}
