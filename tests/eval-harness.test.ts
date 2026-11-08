import { describe, expect, it } from "vitest";
import { runEvalCorpus, scoreCase } from "../src/eval/runner.js";

describe("eval harness", () => {
  it("scores field precision/recall", () => {
    const scored = scoreCase(
      "demo",
      [{ title: "A", price: 1 }],
      [{ title: "A", price: 1 }, { title: "B", price: 2 }],
    );
    expect(scored.fields.find((f) => f.field === "title")?.tp).toBe(1);
    expect(scored.microF1).toBeGreaterThan(0);
  });

  it("runs fixtures/eval corpus", async () => {
    const board = await runEvalCorpus("fixtures/eval");
    expect(board.cases).toBeGreaterThanOrEqual(8);
    // Core structured cases should pass; soft-fail overall if a couple are marginal
    expect(board.passedCases).toBeGreaterThanOrEqual(6);
    expect(board.microF1).toBeGreaterThan(0.5);
  }, 60_000);
});
