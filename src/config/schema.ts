import { z } from "zod";

const FieldTypeSchema = z.enum(["string", "money", "url", "image", "boolean", "enum"]);

export const FieldConfigSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(true),
  normalize: FieldTypeSchema.optional(),
  enumValues: z.array(z.string()).optional(),
});

export const TargetConfigSchema = z.object({
  preset: z.enum([
    "product_list",
    "product_detail",
    "price_only",
    "availability",
    "article_list",
    "custom",
  ]),
  fields: z.array(FieldConfigSchema).optional(),
});

export const HealConfigSchema = z.object({
  enabled: z.boolean().default(true),
  discovery: z.boolean().default(true),
  canary: z.enum(["strict", "balanced", "permissive"]).default("balanced"),
  holdout_pages: z.number().int().nonnegative().default(0),
});

export const BudgetsConfigSchema = z.object({
  max_pages: z.number().int().positive().default(30),
  max_depth: z.number().int().nonnegative().default(3),
  concurrency: z.number().int().positive().default(3),
  request_timeout_ms: z.number().int().positive().default(20_000),
  time_budget_ms: z.number().int().positive().default(60_000),
});

export const OutputConfigSchema = z.object({
  format: z.enum(["json", "jsonl"]).default("json"),
  path: z.string().optional(),
});

export const NotifyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  webhook_url: z.string().url().optional(),
  hmac_secret: z.string().min(1).optional(),
});

export const BrowserFetchConfigSchema = z.object({
  wait_until: z.enum(["domcontentloaded", "load", "networkidle"]).default("domcontentloaded"),
  wait_for: z.string().optional(),
  max_scrolls: z.number().int().nonnegative().default(0),
  load_more_selectors: z.array(z.string()).default([]),
  capture_network_json: z.boolean().default(true),
});

export const FetchConfigSchema = z.object({
  mode: z.enum(["http", "browser"]).default("http"),
  respect_robots: z.boolean().default(true),
  cache: z.boolean().default(true),
  browser: BrowserFetchConfigSchema.default({
    wait_until: "domcontentloaded",
    max_scrolls: 0,
    load_more_selectors: [],
    capture_network_json: true,
  }),
});

export const SessionConfigSchema = z.object({
  cookies_file: z.string().optional(),
  storage_state: z.string().optional(),
  headers: z.record(z.string(), z.string()).default({}),
});

export const LlmPluginSchema = z.object({
  enabled: z.boolean().default(false),
  base_url: z.string().default("https://api.openai.com/v1"),
  api_key_env: z.string().default("OPENAI_API_KEY"),
  model: z.string().default("gpt-4o-mini"),
  use_for: z.array(z.enum(["heal_hints"])).default(["heal_hints"]),
});

export const PluginsConfigSchema = z.object({
  llm: LlmPluginSchema.default({
    enabled: false,
    base_url: "https://api.openai.com/v1",
    api_key_env: "OPENAI_API_KEY",
    model: "gpt-4o-mini",
    use_for: ["heal_hints"],
  }),
});

export const PaginationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_pages: z.number().int().positive().default(10),
});

export const AdaparseConfigSchema = z.object({
  site: z.string().min(1),
  entry: z.union([z.string().url(), z.array(z.string().url()).min(1)]),
  target: TargetConfigSchema,
  heal: HealConfigSchema.default({
    enabled: true,
    discovery: true,
    canary: "balanced",
    holdout_pages: 0,
  }),
  budgets: BudgetsConfigSchema.default({
    max_pages: 30,
    max_depth: 3,
    concurrency: 3,
    request_timeout_ms: 20_000,
    time_budget_ms: 60_000,
  }),
  output: OutputConfigSchema.default({ format: "json" }),
  fetch: FetchConfigSchema.default({
    mode: "http",
    respect_robots: true,
    cache: true,
    browser: {
      wait_until: "domcontentloaded",
      max_scrolls: 0,
      load_more_selectors: [],
      capture_network_json: true,
    },
  }),
  pagination: PaginationConfigSchema.default({
    enabled: true,
    max_pages: 10,
  }),
  session: SessionConfigSchema.default({ headers: {} }),
  plugins: PluginsConfigSchema.default({
    llm: {
      enabled: false,
      base_url: "https://api.openai.com/v1",
      api_key_env: "OPENAI_API_KEY",
      model: "gpt-4o-mini",
      use_for: ["heal_hints"],
    },
  }),
  notify: NotifyConfigSchema.default({ enabled: false }),
  fixtures: z.record(z.string(), z.string()).optional(),
  state_dir: z.string().optional(),
});

export type RawAdaparseConfig = z.infer<typeof AdaparseConfigSchema>;
