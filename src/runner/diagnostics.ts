import type { Diagnostic } from "../types.js";

export function logDiagnostics(
  diagnostics: Diagnostic[],
  log: (msg: string) => void = (m) => console.error(m),
): void {
  for (const d of diagnostics) {
    log(`[${d.level}] ${d.code}: ${d.message}`);
  }
}

export function mergeDiagnostics(...groups: Diagnostic[][]): Diagnostic[] {
  return groups.flat();
}
