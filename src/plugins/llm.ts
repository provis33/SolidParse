import type { Diagnostic, FieldConfig, LlmPluginConfig } from "../types.js";

export interface HealHint {
  field: string;
  signals: string[];
  selectors?: string[];
  note?: string;
}

export interface LlmHealHintResult {
  hints: HealHint[];
  diagnostics: Diagnostic[];
}

/**
 * Optional OpenAI-compatible helper for heal_hints only.
 * Опциональный LLM-плагин: только подсказки при heal, ядро без него живёт.
 * If disabled or unreachable, core path is unchanged.
 */
export async function requestHealHints(opts: {
  config: LlmPluginConfig;
  html: string;
  fields: FieldConfig[];
  sample?: Record<string, unknown>[];
  fetchImpl?: typeof fetch;
}): Promise<LlmHealHintResult> {
  const diagnostics: Diagnostic[] = [];
  const { config } = opts;

  if (!config.enabled || !config.useFor.includes("heal_hints")) {
    return { hints: [], diagnostics };
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    diagnostics.push({
      level: "warn",
      code: "llm_skipped",
      message: `LLM plugin enabled but env ${config.apiKeyEnv} is empty`,
    });
    return { hints: [], diagnostics };
  }

  const truncated = opts.html.slice(0, 12_000);
  const sampleJson = JSON.stringify((opts.sample ?? []).slice(0, 3)).slice(0, 2000);
  const fieldNames = opts.fields.map((f) => f.name).join(", ");

  const body = {
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You suggest ranked field extraction hints for a self-healing scraper. " +
          "Reply with JSON only: {\"hints\":[{\"field\":\"title\",\"signals\":[\"h1\",\"og:title\"],\"selectors\":[\".product-title\"],\"note\":\"...\"}]}. " +
          "Hints are candidates only; they must still pass canary validation.",
      },
      {
        role: "user",
        content: `Fields: ${fieldNames}\nLast-good sample: ${sampleJson}\nHTML:\n${truncated}`,
      },
    ],
  };

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      diagnostics.push({
        level: "warn",
        code: "llm_http_error",
        message: `LLM HTTP ${res.status}`,
      });
      return { hints: [], diagnostics };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const hints = parseHints(content);
    diagnostics.push({
      level: "info",
      code: "llm_heal_hints",
      message: `LLM returned ${hints.length} hint(s)`,
      details: { model: config.model },
    });
    return { hints, diagnostics };
  } catch (err) {
    diagnostics.push({
      level: "warn",
      code: "llm_unreachable",
      message: err instanceof Error ? err.message : String(err),
    });
    return { hints: [], diagnostics };
  }
}

export function parseHints(content: string): HealHint[] {
  const trimmed = content.trim();
  const jsonSlice = extractJsonObject(trimmed);
  if (!jsonSlice) return [];
  try {
    const parsed = JSON.parse(jsonSlice) as { hints?: unknown };
    if (!Array.isArray(parsed.hints)) return [];
    const out: HealHint[] = [];
    for (const h of parsed.hints) {
      if (!h || typeof h !== "object") continue;
      const o = h as Record<string, unknown>;
      if (typeof o.field !== "string") continue;
      const signals = Array.isArray(o.signals)
        ? o.signals.filter((s): s is string => typeof s === "string")
        : [];
      const hint: HealHint = {
        field: o.field,
        signals,
      };
      if (Array.isArray(o.selectors)) {
        hint.selectors = o.selectors.filter((s): s is string => typeof s === "string");
      }
      if (typeof o.note === "string") hint.note = o.note;
      out.push(hint);
    }
    return out;
  } catch {
    return [];
  }
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}
