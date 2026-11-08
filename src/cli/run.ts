import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfigFromFile } from "../config/load.js";
import { runJob } from "../runner/orchestrator.js";
import type { RunResult } from "../types.js";

export async function runFromConfig(opts: {
  configPath: string;
  json?: boolean;
  doctor?: boolean;
  forceHeal?: boolean;
}): Promise<{ result: RunResult; exitCode: number }> {
  const config = loadConfigFromFile(opts.configPath);
  const result = await runJob({
    config,
    doctor: opts.doctor,
    forceHeal: opts.forceHeal,
    log: (m) => console.error(m),
  });

  const payload = JSON.stringify(result, null, 2);

  if (config.output.path && !opts.doctor) {
    const abs = resolve(config.output.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, payload, "utf8");
    console.error(`adaparse: wrote ${abs}`);
  }

  if (opts.json || !config.output.path || opts.doctor) {
    console.log(payload);
  } else if (!opts.json) {
    console.log(payload);
  }

  return { result, exitCode: result.ok ? 0 : 1 };
}
