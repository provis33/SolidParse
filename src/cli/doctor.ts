import { runFromConfig } from "./run.js";

export async function doctorCommand(configPath: string, json = true) {
  return runFromConfig({ configPath, doctor: true, json });
}
