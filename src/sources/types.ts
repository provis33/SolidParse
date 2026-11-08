import type { CheerioAPI } from "cheerio";
import type { Diagnostic, ExtractAttempt, FieldConfig, TargetPreset } from "../types.js";

export interface SourceContext {
  $: CheerioAPI;
  html: string;
  url: string;
  preset: TargetPreset;
  fields: FieldConfig[];
}

export interface SourceExtractor {
  name: string;
  extract(ctx: SourceContext): ExtractAttempt | null;
}

export function emptyAttempt(
  source: ExtractAttempt["source"],
  diagnostics: Diagnostic[] = [],
): ExtractAttempt {
  return { source, items: [], diagnostics, scores: {} };
}
