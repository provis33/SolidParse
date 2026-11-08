import { runFromConfig } from "./run.js";

export async function healCommand(configPath: string, json = true) {
  return runFromConfig({ configPath, forceHeal: true, json });
}
