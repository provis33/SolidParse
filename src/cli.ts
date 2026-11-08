import { defineCommand, runMain } from "citty";
import { doctorCommand } from "./cli/doctor.js";
import { evalCommand } from "./cli/eval.js";
import { healCommand } from "./cli/heal.js";
import { initConfig } from "./cli/init.js";
import { metricsCommand } from "./cli/metrics.js";
import { ruleExport, ruleImport } from "./cli/rule.js";
import { runFromConfig } from "./cli/run.js";
import { snapshotDiff, snapshotShow } from "./cli/snapshot.js";
import { getVersion } from "./cli/version.js";
import { watchCommand } from "./cli/watch.js";

const main = defineCommand({
  meta: {
    name: "adaparse",
    version: getVersion(),
    description: "Target-driven, signal-based, self-healing web extraction engine",
  },
  subCommands: {
    init: defineCommand({
      meta: { name: "init", description: "Write a sample adaparse.yaml" },
      args: {
        out: { type: "string", description: "Output path", default: "adaparse.yaml" },
      },
      run({ args }) {
        const path = initConfig(String(args.out));
        console.error(`Wrote ${path}`);
      },
    }),
    run: defineCommand({
      meta: { name: "run", description: "Run extraction from config" },
      args: {
        c: { type: "string", description: "Config path", required: true },
        json: { type: "boolean", description: "Force JSON on stdout", default: false },
      },
      async run({ args }) {
        const { exitCode } = await runFromConfig({
          configPath: String(args.c),
          json: Boolean(args.json),
        });
        process.exitCode = exitCode;
      },
    }),
    doctor: defineCommand({
      meta: {
        name: "doctor",
        description: "Diagnose sources/signals without writing heal state",
      },
      args: {
        c: { type: "string", description: "Config path", required: true },
        json: { type: "boolean", default: true },
      },
      async run({ args }) {
        const { exitCode } = await doctorCommand(String(args.c), Boolean(args.json));
        process.exitCode = exitCode;
      },
    }),
    heal: defineCommand({
      meta: { name: "heal", description: "Force self-heal attempt" },
      args: {
        c: { type: "string", description: "Config path", required: true },
        json: { type: "boolean", default: true },
      },
      async run({ args }) {
        const { exitCode } = await healCommand(String(args.c), Boolean(args.json));
        process.exitCode = exitCode;
      },
    }),
    snapshot: defineCommand({
      meta: { name: "snapshot", description: "Show or diff stored snapshots" },
      args: {
        action: { type: "positional", description: "show | diff", required: true },
        c: { type: "string", description: "Config path", required: true },
      },
      run({ args }) {
        const action = String(args.action);
        if (action === "show") snapshotShow(String(args.c));
        else if (action === "diff") snapshotDiff(String(args.c));
        else {
          console.error(`Unknown snapshot action: ${action} (use show|diff)`);
          process.exitCode = 2;
        }
      },
    }),
    watch: defineCommand({
      meta: { name: "watch", description: "Loop extract + snapshot drift alerts" },
      args: {
        c: { type: "string", description: "Config path", required: true },
        interval: { type: "string", description: "Seconds between ticks", default: "300" },
        once: { type: "boolean", description: "Single tick then exit", default: false },
      },
      async run({ args }) {
        process.exitCode = await watchCommand({
          configPath: String(args.c),
          intervalSec: Number(args.interval) || 300,
          once: Boolean(args.once),
        });
      },
    }),
    rule: defineCommand({
      meta: { name: "rule", description: "Export/import versioned rule packs" },
      args: {
        action: { type: "positional", description: "export | import", required: true },
        c: { type: "string", description: "Config path", required: true },
        o: { type: "string", description: "Output pack path (export)" },
        i: { type: "string", description: "Input pack path (import)" },
      },
      run({ args }) {
        const action = String(args.action);
        try {
          if (action === "export") {
            if (!args.o) throw new Error("rule export requires -o pack.json");
            ruleExport(String(args.c), String(args.o));
          } else if (action === "import") {
            if (!args.i) throw new Error("rule import requires -i pack.json");
            ruleImport(String(args.c), String(args.i));
          } else {
            console.error(`Unknown rule action: ${action} (use export|import)`);
            process.exitCode = 2;
          }
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    }),
    eval: defineCommand({
      meta: { name: "eval", description: "Run offline eval corpus scoreboard" },
      args: {
        d: { type: "string", description: "Eval corpus directory", default: "fixtures/eval" },
      },
      async run({ args }) {
        const { exitCode } = await evalCommand(String(args.d));
        process.exitCode = exitCode;
      },
    }),
    metrics: defineCommand({
      meta: { name: "metrics", description: "Summarize stored run metrics" },
      args: {
        c: { type: "string", description: "Config path", required: true },
      },
      run({ args }) {
        metricsCommand(String(args.c));
      },
    }),
    version: defineCommand({
      meta: { name: "version", description: "Print version" },
      run() {
        console.log(getVersion());
      },
    }),
  },
});

runMain(main);
