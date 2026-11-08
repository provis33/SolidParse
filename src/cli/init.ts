import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SAMPLE = `site: example
entry: https://example.com/catalog
target:
  preset: product_list
  fields:
    - name: title
      required: true
    - name: price
      required: true
      normalize: money
    - name: url
      required: true
    - name: image
      required: false
heal:
  enabled: true
  discovery: true
  canary: balanced
budgets:
  max_pages: 30
  max_depth: 3
  concurrency: 3
  request_timeout_ms: 20000
  time_budget_ms: 60000
output:
  format: json
  path: ./out/result.json
`;

export function initConfig(outPath = "adaparse.yaml"): string {
  const abs = resolve(outPath);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, SAMPLE, "utf8");
  return abs;
}
