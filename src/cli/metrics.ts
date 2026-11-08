import { loadConfigFromFile } from "../config/load.js";
import { openDb } from "../memory/db.js";
import { summarizeMetrics } from "../runner/orchestrator.js";

export function metricsCommand(configPath: string): void {
  const config = loadConfigFromFile(configPath);
  const stateDir = config.stateDir ?? `.adaparse/${config.site}`;
  const db = openDb(stateDir);
  const summary = summarizeMetrics(db, config.site);
  console.log(JSON.stringify({ site: config.site, ...summary }, null, 2));
  console.error(
    `adaparse:metrics runs=${summary.runs} okRate=${summary.okRate.toFixed(2)} ` +
      `avgItems=${summary.avgItems.toFixed(1)} healRate=${summary.healRate.toFixed(2)}`,
  );
}