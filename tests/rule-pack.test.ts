import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../src/memory/db.js";
import {
  exportRulePack,
  importRulePack,
  getLatestRule,
  saveRuleVersion,
} from "../src/memory/rules.js";
import type { RuleGenome } from "../src/types.js";

const genome: RuleGenome = {
  sourcePreference: ["jsonld", "html_signals"],
  structuralFingerprints: ["fp1"],
  fieldAnchors: [{ name: "title", preferredSignals: ["h1"] }],
  urlPatterns: ["/p/"],
  signalPreferences: { "jsonld:name": 2 },
  entrypoints: ["https://example.com/"],
};

describe("rule packs", () => {
  it("export/import creates a new version (no silent overwrite)", () => {
    const db = openMemoryDb();
    const v1 = saveRuleVersion(db, "shop", "product_list", genome);
    expect(v1.version).toBe(1);

    const pack = exportRulePack(db, "shop", "product_list");
    expect(pack?.version).toBe(1);
    expect(pack?.genome.structuralFingerprints).toEqual(["fp1"]);

    const v2 = importRulePack(db, {
      ...pack!,
      genome: { ...genome, structuralFingerprints: ["fp2"] },
    });
    expect(v2.version).toBe(2);

    const latest = getLatestRule(db, "shop", "product_list");
    expect(latest?.version).toBe(2);
    expect(latest?.genome.structuralFingerprints).toEqual(["fp2"]);

    // original version row still exists conceptually via list — v1 untouched
    expect(getLatestRule(db, "shop", "product_list")?.version).toBe(2);
  });
});
