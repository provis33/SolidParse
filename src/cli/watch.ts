import type { DatabaseSync } from "node:sqlite";
import { loadConfigFromFile } from "../config/load.js";
import { openDb } from "../memory/db.js";
import { diffSnapshots } from "../memory/diff.js";
import { getLatestSnapshot } from "../memory/snapshots.js";
import { deliverWebhook } from "../notify/webhook.js";
import { runJob } from "../runner/orchestrator.js";
import type { AdaparseConfig, RunResult } from "../types.js";

export interface WatchOptions {
  configPath: string;
  intervalSec: number;
  once?: boolean;
}

export async function watchCommand(opts: WatchOptions): Promise<number> {
  const config = loadConfigFromFile(opts.configPath);
  const stateDir = config.stateDir ?? `.adaparse/${config.site}`;
  const db = openDb(stateDir);

  let stopping = false;
  const onSig = () => {
    stopping = true;
    console.error("adaparse:watch soft stop (SIGINT) — finishing current tick");
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  let exitCode = 0;
  do {
    const previous = getLatestSnapshot(db, config.site, config.target.preset);
    const prevItems = previous
      ? (JSON.parse(previous.sampleJson) as Record<string, unknown>[])
      : [];

    console.error(`adaparse:watch tick site=${config.site}`);
    let result: RunResult;
    try {
      result = await runJob({
        config,
        db,
        log: (m) => console.error(m),
      });
    } catch (err) {
      console.error(`adaparse:watch error: ${err instanceof Error ? err.message : String(err)}`);
      exitCode = 1;
      break;
    }

    const diff = diffSnapshots(prevItems, result.items);
    const drift =
      diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

    recordWatchRun(db, config, result, drift, diff);

    if (drift || !result.ok || result.meta.healed) {
      console.error(
        `adaparse:watch alert ok=${result.ok} drift=${drift} healed=${result.meta.healed} ` +
          `+${diff.added.length}/-${diff.removed.length}/~${diff.changed.length}`,
      );
      if (config.notify?.enabled) {
        await deliverWebhook(
          {
            ...config.notify,
            enabled: true,
          },
          {
            ...result,
            meta: {
              ...result.meta,
              diagnostics: [
                ...result.meta.diagnostics,
                {
                  level: "info",
                  code: "watch_drift",
                  message: `drift=${drift}`,
                  details: {
                    added: diff.added.length,
                    removed: diff.removed.length,
                    changed: diff.changed.length,
                  },
                },
              ],
            },
          },
        );
      }
    } else {
      console.error(`adaparse:watch stable items=${result.items.length}`);
    }

    if (!result.ok) exitCode = 1;
    if (opts.once || stopping) break;

    await sleep(opts.intervalSec * 1000);
  } while (!stopping);

  process.off("SIGINT", onSig);
  process.off("SIGTERM", onSig);
  return exitCode;
}

function recordWatchRun(
  db: DatabaseSync,
  config: AdaparseConfig,
  result: RunResult,
  drift: boolean,
  diff: ReturnType<typeof diffSnapshots>,
): void {
  db.prepare(
    `INSERT INTO watch_runs (site, target, ok, item_count, drift, healed, failure_class, diff_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    config.site,
    config.target.preset,
    result.ok ? 1 : 0,
    result.items.length,
    drift ? 1 : 0,
    result.meta.healed ? 1 : 0,
    result.meta.failureClass,
    JSON.stringify({
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
      countDelta: diff.countDelta,
    }),
    new Date().toISOString(),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
