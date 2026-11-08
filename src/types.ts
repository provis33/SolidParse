export type FailureClass =
  | "selector_drift"
  | "content_moved"
  | "empty_result"
  | "soft_404"
  | "fetch_blocked"
  | "antibot_suspected"
  | "invalid_target_config"
  | "validation_failed"
  | "discovery_exhausted"
  | "robots_blocked";

export type ExtractSource =
  | "jsonld"
  | "microdata"
  | "opengraph"
  | "embedded"
  | "api_mine"
  | "network"
  | "html_signals"
  | "healed_rule"
  | "discovery"
  | "cached_rule";

export type FieldType = "string" | "money" | "url" | "image" | "boolean" | "enum";

export type CanaryMode = "strict" | "balanced" | "permissive";

export type FetchMode = "http" | "browser";

export type TargetPreset =
  | "product_list"
  | "product_detail"
  | "price_only"
  | "availability"
  | "article_list"
  | "custom";

export interface Diagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ScoredValue {
  value: unknown;
  score: number;
  reasons: string[];
}

export interface FieldCandidate {
  name: string;
  candidates: ScoredValue[];
}

export interface ItemCandidate {
  fields: Record<string, ScoredValue>;
  score: number;
  reasons: string[];
  fingerprint?: string;
  identity?: string;
}

export interface ExtractAttempt {
  source: ExtractSource;
  items: ItemCandidate[];
  diagnostics: Diagnostic[];
  scores: Record<string, number>;
}

export interface RunResult {
  ok: boolean;
  target: TargetPreset | string;
  items: Record<string, unknown>[];
  meta: {
    source: ExtractSource | null;
    ruleVersion: number | null;
    scores: Record<string, number>;
    diagnostics: Diagnostic[];
    healed: boolean;
    failureClass: FailureClass | null;
    entryUrl?: string;
    discoveredUrl?: string | null;
    pagesFetched?: number;
  };
}

export interface FieldAnchor {
  name: string;
  preferredSignals: string[];
  exampleValues?: string[];
  patterns?: string[];
  fingerprintHints?: string[];
}

export interface RuleGenome {
  sourcePreference: ExtractSource[];
  structuralFingerprints: string[];
  fieldAnchors: FieldAnchor[];
  urlPatterns: string[];
  signalPreferences: Record<string, number>;
  entrypoints: string[];
  layoutFingerprint?: string;
}

export interface StoredRule {
  id: number;
  site: string;
  target: string;
  version: number;
  genome: RuleGenome;
  createdAt: string;
}

export interface SnapshotRecord {
  id: number;
  site: string;
  target: string;
  url: string;
  itemCount: number;
  sampleJson: string;
  createdAt: string;
}

export interface BudgetConfig {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  requestTimeoutMs: number;
  timeBudgetMs: number;
}

export interface HealConfig {
  enabled: boolean;
  discovery: boolean;
  canary: CanaryMode;
  holdoutPages: number;
}

export type BrowserWaitUntil = "domcontentloaded" | "load" | "networkidle";

export interface BrowserFetchConfig {
  waitUntil: BrowserWaitUntil;
  waitFor?: string;
  maxScrolls: number;
  loadMoreSelectors: string[];
  captureNetworkJson: boolean;
}

export interface FetchConfig {
  mode: FetchMode;
  respectRobots: boolean;
  cache: boolean;
  browser: BrowserFetchConfig;
}

export interface SessionConfig {
  cookiesFile?: string;
  storageState?: string;
  headers: Record<string, string>;
}

export interface LlmPluginConfig {
  enabled: boolean;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  useFor: Array<"heal_hints">;
}

export interface PluginsConfig {
  llm: LlmPluginConfig;
}

export interface PaginationConfig {
  enabled: boolean;
  maxPages: number;
}

export interface FieldConfig {
  name: string;
  required: boolean;
  normalize?: FieldType;
  enumValues?: string[];
}

export interface TargetConfig {
  preset: TargetPreset;
  fields: FieldConfig[];
}

export interface OutputConfig {
  format: "json" | "jsonl";
  path?: string;
}

export interface NotifyConfig {
  enabled: boolean;
  webhookUrl?: string;
  hmacSecret?: string;
}

export interface AdaparseConfig {
  site: string;
  entry: string | string[];
  target: TargetConfig;
  heal: HealConfig;
  budgets: BudgetConfig;
  output: OutputConfig;
  fetch: FetchConfig;
  pagination: PaginationConfig;
  session: SessionConfig;
  plugins: PluginsConfig;
  notify?: NotifyConfig;
  /** Offline/test: URL → HTML or file path / офлайн: URL → HTML или файл */
  fixtures?: Record<string, string>;
  stateDir?: string;
}

export interface FetchResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
  fromCache?: boolean;
  /** Browser-sniffed JSON payloads / JSON, пойманный из сети браузера */
  networkJson?: unknown[];
}

export interface Fetcher {
  fetch(url: string, opts?: { timeoutMs?: number }): Promise<FetchResponse>;
}
