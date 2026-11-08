import { run } from "../src/index.js";

const result = await run({
  site: "demo-shop",
  entry: "https://fixtures.adaparse.local/catalog",
  target: {
    preset: "product_list",
    fields: [
      { name: "title", required: true },
      { name: "price", required: true, normalize: "money" },
      { name: "url", required: true, normalize: "url" },
    ],
  },
  heal: { enabled: true, discovery: true, canary: "balanced" },
  budgets: {
    maxPages: 10,
    maxDepth: 2,
    concurrency: 2,
    requestTimeoutMs: 5000,
    timeBudgetMs: 15000,
  },
  output: { format: "json" },
  fixtures: {
    "https://fixtures.adaparse.local/catalog": "fixtures/html/A_old_layout.html",
  },
  stateDir: ".adaparse/example-programmatic",
});

console.log(JSON.stringify(result, null, 2));
