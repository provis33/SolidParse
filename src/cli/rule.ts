import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigFromFile } from "../config/load.js";
import { openDb } from "../memory/db.js";
import {
  exportRulePack,
  importRulePack,
  type RulePack,
} from "../memory/rules.js";

export function ruleExport(configPath: string, outPath: string): void {
  const config = loadConfigFromFile(configPath);
  const stateDir = config.stateDir ?? `.adaparse/${config.site}`;
  const db = openDb(stateDir);
  const pack = exportRulePack(db, config.site, config.target.preset);
  if (!pack) {
    throw new Error(`No rule genome found for ${config.site}/${config.target.preset}`);
  }
  const abs = resolve(outPath);
  writeFileSync(abs, JSON.stringify(pack, null, 2), "utf8");
  console.error(`adaparse:rule exported v${pack.version} → ${abs}`);
}

export function ruleImport(configPath: string, inPath: string): void {
  const config = loadConfigFromFile(configPath);
  const stateDir = config.stateDir ?? `.adaparse/${config.site}`;
  const db = openDb(stateDir);
  const abs = resolve(inPath);
  const pack = JSON.parse(readFileSync(abs, "utf8")) as RulePack;
  if (!pack.genome || !pack.site || !pack.target) {
    throw new Error("Invalid rule pack: need site, target, genome");
  }
  // Bind pack to this config's site/target / привязка пака к site/target из конфига
  const saved = importRulePack(db, {
    ...pack,
    site: config.site,
    target: config.target.preset,
  });
  console.error(
    `adaparse:rule imported as new version v${saved.version} for ${saved.site}/${saved.target}`,
  );
}
