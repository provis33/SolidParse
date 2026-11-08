import { load } from "cheerio";
import { moneyCandidatesFromText, parseMoneyAmount } from "../signals/money.js";
import { titleCandidates } from "../signals/title.js";
import {
  buildSourceContext,
  extractFromHtml,
  extractWithFingerprint,
} from "../sources/index.js";
import type {
  Diagnostic,
  ExtractAttempt,
  FieldConfig,
  RuleGenome,
  TargetPreset,
} from "../types.js";

export interface HealStrategyResult {
  name: string;
  attempt: ExtractAttempt;
  diagnostics: Diagnostic[];
}

/** Reuse last-good fingerprints / вернуть старые fingerprint'ы на ту же страницу */
export function strategyFingerprint(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
  genome: RuleGenome,
): HealStrategyResult {
  const ctx = buildSourceContext(html, url, preset, fields);
  const attempt = extractWithFingerprint(ctx, genome.structuralFingerprints);
  return {
    name: "reuse_fingerprint",
    attempt,
    diagnostics: [
      {
        level: "info",
        code: "heal_strategy",
        message: "Tried reuse last-good structural fingerprint",
      },
      ...attempt.diagnostics,
    ],
  };
}

/** Fresh signal pass for the same target / заново по сигналам под тот же target */
export function strategyRedeetect(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
): HealStrategyResult {
  const attempt = extractFromHtml(html, url, preset, fields);
  return {
    name: "redetect_signals",
    attempt: { ...attempt, source: "healed_rule" },
    diagnostics: [
      {
        level: "info",
        code: "heal_strategy",
        message: "Tried re-detect by signals",
      },
      ...attempt.diagnostics,
    ],
  };
}

/** Rebuild anchors from last-good examples / якоря по прошлым примерам полей */
export function strategyAnchors(
  html: string,
  url: string,
  preset: TargetPreset,
  fields: FieldConfig[],
  genome: RuleGenome,
): HealStrategyResult {
  const base = extractFromHtml(html, url, preset, fields);
  const $ = load(html);
  const pageText = $.root().text();

  const items = base.items.map((item) => {
    const fieldsOut = { ...item.fields };
    for (const anchor of genome.fieldAnchors) {
      if (fieldsOut[anchor.name]) continue;
      if (anchor.name === "price") {
        const examples = (anchor.exampleValues ?? [])
          .map((v) => parseMoneyAmount(v))
          .filter((n): n is number => n != null);
        const hits = moneyCandidatesFromText(pageText);
        const match = hits.find((h) =>
          examples.some((ex) => Math.abs(Number(h.value) - ex) / Math.max(ex, 1) < 0.25),
        );
        if (match) {
          fieldsOut.price = {
            ...match,
            reasons: [...match.reasons, "heal:anchor_price"],
          };
        }
      }
      if (anchor.name === "title" && anchor.exampleValues?.length) {
        const titles = titleCandidates($);
        const match = titles.find((t) =>
          anchor.exampleValues!.some(
            (ex) =>
              String(t.value).toLowerCase().includes(ex.toLowerCase().slice(0, 12)) ||
              ex.toLowerCase().includes(String(t.value).toLowerCase().slice(0, 12)),
          ),
        );
        if (match) {
          fieldsOut.title = {
            ...match,
            reasons: [...match.reasons, "heal:anchor_title"],
          };
        }
      }
    }
    const score =
      Object.values(fieldsOut).reduce((s, f) => s + f.score, 0) /
      Math.max(1, Object.keys(fieldsOut).length);
    return { ...item, fields: fieldsOut, score, reasons: [...item.reasons, "heal:anchors"] };
  });

  return {
    name: "rebuild_anchors",
    attempt: {
      source: "healed_rule",
      items,
      diagnostics: [
        {
          level: "info",
          code: "heal_anchors",
          message: "Rebuilt field anchors from last-good examples",
        },
      ],
      scores: { ...base.scores, anchored: items.length },
    },
    diagnostics: [
      {
        level: "info",
        code: "heal_strategy",
        message: "Tried rebuild field anchors",
      },
    ],
  };
}
